import type { AWBData } from '../types'

/**
 * Парсит текст Air Waybill (IATA стандарт) и извлекает структурированные данные.
 * Поддерживает форматы CALOGI, Cargo Wise, iFly и другие.
 */
export function parseAWBText(raw: string): Partial<AWBData> {
  const text = raw.replace(/\r/g, '\n')
  const result: Partial<AWBData> = {}

  // ── AWB номер: 410-00192566 или 410 00192566 ──────────────────────────────
  const awbMatch = text.match(/\b(\d{3})\s*[-–]\s*(\d{7,8})\b/)
  if (awbMatch) result.awb_number = `${awbMatch[1]}-${awbMatch[2]}`

  // ── Референс номер ────────────────────────────────────────────────────────
  const refPatterns = [
    /Reference\s+Number[:\s]+([A-Z0-9]+)/i,
    /\b(CAL\d{9,})\b/,
    /\b(REF[:\s]+)([A-Z0-9]+)/i,
  ]
  for (const p of refPatterns) {
    const m = text.match(p)
    if (m) { result.reference_number = (m[2] || m[1]).trim(); break }
  }

  // ── Аэропорты ─────────────────────────────────────────────────────────────
  const depPatterns = [
    /Airport\s+of\s+Departure[^:\n]*[:\n]\s*([^\n]+)/i,
    /Airport\s+of\s+Departure\s+(?:and\s+requested\s+Routing\s*)?([A-Z\s]+?)(?:\n|$)/i,
    /(?:from|departure)[:\s]+([A-Z\s]{3,30})/i,
  ]
  for (const p of depPatterns) {
    const m = text.match(p)
    if (m && m[1].trim()) { result.airport_of_departure = m[1].trim(); break }
  }

  const destPatterns = [
    /Airport\s+of\s+Destination[^:\n]*[:\n]\s*([^\n]+)/i,
    /(?:to|destination)[:\s]+([A-Z\s]{3,30})/i,
  ]
  for (const p of destPatterns) {
    const m = text.match(p)
    if (m && m[1].trim()) { result.airport_of_destination = m[1].trim(); break }
  }

  // ── Первый перевозчик и маршрут ───────────────────────────────────────────
  const carrierMatch = text.match(/By\s+First\s+Carrier[:\s]+([A-Z0-9]{2,3})/i)
    || text.match(/First\s+Carrier[:\s]+([A-Z0-9]{2,3})/i)
  if (carrierMatch) result.first_carrier = carrierMatch[1]

  // Маршрут: SVO ZR или ZR4/56/2
  const routeMatch = text.match(/\bSVO\b|\bDME\b|\bSHE\b|\bVKO\b/)
  if (routeMatch) result.routing_destination_1 = routeMatch[0]

  const flightMatch = text.match(/([A-Z]{2}\d{1,4}\/\d{1,4}\/?\d*)/i)
  if (flightMatch) result.routing_carrier_1 = flightMatch[1]

  // ── Shipper ───────────────────────────────────────────────────────────────
  const shipperBlock = extractAfterLabel(text, [
    "Shipper's Name and Address",
    "Shipper Name",
    "SHIPPER",
  ], ["Consignee", "Not Negotiable", "Issuing", "Air Waybill"])

  if (shipperBlock) {
    const lines = cleanLines(shipperBlock)
    if (lines.length > 0) result.shipper_name = lines[0]
    if (lines.length > 1) {
      result.shipper_address = lines.slice(1).join(', ')
    }
  }

  // ── Consignee ─────────────────────────────────────────────────────────────
  const consigneeBlock = extractAfterLabel(text, [
    "Consignee's Name and Address",
    "Consignee Name",
    "CONSIGNEE",
  ], ["Issuing Carrier", "It is agreed", "Agent's IATA", "Account No", "INN"])

  if (consigneeBlock) {
    const lines = cleanLines(consigneeBlock)
    if (lines.length > 0) result.consignee_name = lines[0]
    if (lines.length > 1) {
      result.consignee_address = lines.slice(1).join(', ')
    }
  }

  // ── Агент ─────────────────────────────────────────────────────────────────
  const agentBlock = extractAfterLabel(text, [
    "Issuing Carrier's Agent Name and City",
    "Agent Name",
  ], ["Agent's IATA", "Accounting", "Account No"])

  if (agentBlock) {
    const lines = cleanLines(agentBlock)
    if (lines.length > 0) result.issuing_agent_name = lines[0]
    if (lines.length > 1) result.issuing_agent_city = lines[1]
  }

  // ── IATA код агента ───────────────────────────────────────────────────────
  const iataPatterns = [
    /Agent['']?s\s+IATA\s+Code[:\s]+(\d{7})/i,
    /IATA\s+Code[:\s]+(\d{7})/i,
    /\b(\d{7})\b.*?IATA/i,
  ]
  for (const p of iataPatterns) {
    const m = text.match(p)
    if (m) { result.agent_iata_code = m[1]; break }
  }

  // ── Account No ────────────────────────────────────────────────────────────
  const accMatch = text.match(/Account\s+No[:\s.]+([A-Z0-9]+)/i)
    || text.match(/\bDCW[0-9]+\b/)
  if (accMatch) result.agent_account_no = (accMatch[1] || accMatch[0]).trim()

  // ── Accounting info ───────────────────────────────────────────────────────
  const accInfoMatch = text.match(/Accounting\s+Information[:\s]+([^\n]+)/i)
    || text.match(/(DOW\d+-[A-Z]+\s+[A-Z]+)/i)
  if (accInfoMatch) result.accounting_info = (accInfoMatch[1] || accInfoMatch[0]).trim()

  // ── Валюта ────────────────────────────────────────────────────────────────
  const currMatch = text.match(/Currency[:\s]+([A-Z]{3})/i)
    || text.match(/\b(AED|USD|EUR|GBP|CNY|RUB|TJS)\b/)
  if (currMatch) result.currency = (currMatch[1] || currMatch[0]).trim()

  // ── Вид оплаты ────────────────────────────────────────────────────────────
  if (/MODE\s+OF\s+PAYMENT\s*:?\s*Prepaid/i.test(text) || /\bPrepaid\b/i.test(text)) {
    result.mode_of_payment = 'Prepaid'
    result.weight_val_charge = 'PP'
    result.other_charge_code = 'PP'
  } else if (/MODE\s+OF\s+PAYMENT\s*:?\s*Collect/i.test(text)) {
    result.mode_of_payment = 'Collect'
    result.weight_val_charge = 'CC'
    result.other_charge_code = 'CC'
  }

  // ── Объявленные ценности ──────────────────────────────────────────────────
  if (/\bNVD\b/.test(text)) result.declared_value_carriage = 'NVD'
  if (/\bNCV\b/.test(text)) result.declared_value_customs = 'NCV'

  // ── SCI ───────────────────────────────────────────────────────────────────
  if (/\bSCI\b/.test(text)) result.sci_code = 'SCI'

  // ── Количество мест ───────────────────────────────────────────────────────
  // Паттерн из имени файла: "1PC" или "2PC"
  const piecesFromName = raw.match(/\b(\d+)\s*PC\b/i)
  const piecesFromText = text.match(/No\.\s*of\s*Pieces\s*RCP[:\s]+(\d+)/i)
    || text.match(/\bRCP\s+(\d+)/i)
    || text.match(/(\d+)\s*(?:PCS?|PIECES?)\b/i)
  const piecesMatch = piecesFromText || piecesFromName
  if (piecesMatch) result.number_of_pieces = parseInt(piecesMatch[1])

  // ── Вес ───────────────────────────────────────────────────────────────────
  // Паттерн из имени файла: "81KG"
  const weightFromName = raw.match(/\b(\d+\.?\d*)\s*KG\b/i)
  const weightFromText = text.match(/Gross\s+Weight[:\s]+(\d+\.?\d*)/i)
    || text.match(/\b(\d+\.?\d*)\s+K\b/i)
    || text.match(/\b(\d{2,4}\.?\d{0,2})\s*(?:KG|K)\b/i)
  const weightMatch = weightFromText || weightFromName
  if (weightMatch) result.gross_weight = parseFloat(weightMatch[1])

  result.weight_unit = /\b(?:LBS?|L)\b/i.test(text) ? 'L' : 'K'

  // ── Оплачиваемый вес ─────────────────────────────────────────────────────
  const cwMatch = text.match(/Chargeable\s+Weight[:\s]+(\d+\.?\d*)/i)
  if (cwMatch) result.chargeable_weight = parseFloat(cwMatch[1])

  // ── Rate / Charge ─────────────────────────────────────────────────────────
  const rateMatch = text.match(/Rate\s*\/?\s*Charge[:\s]+(\d+\.?\d*)/i)
    || text.match(/(?:^|\s)(\d{2,3}\.\d{2})\s*(?:\n|$)/m)
  if (rateMatch) result.rate = parseFloat(rateMatch[1])

  // ── Total ─────────────────────────────────────────────────────────────────
  const totalPatterns = [
    /\bTotal\b[^:\n]{0,20}[:\s](\d[\d,]+\.?\d*)/i,
    /(\d[\d,]+\.?\d*)\s*\n.*?Total/i,
    /\b(\d{4,}\.?\d{0,2})\b/,  // число >= 1000
  ]
  for (const p of totalPatterns) {
    const m = text.match(p)
    if (m) { result.total = parseFloat(m[1].replace(/,/g, '')); break }
  }

  // ── Prepaid / Collect суммы ───────────────────────────────────────────────
  const prepaidMatch = text.match(/Total\s+prepaid[:\s]+(\d[\d,]+\.?\d*)/i)
    || text.match(/(\d[\d,]+\.?\d*)\s*(?:\n[^\n]*){0,3}Total\s+prepaid/i)
  if (prepaidMatch) {
    const val = parseFloat(prepaidMatch[1].replace(/,/g, ''))
    result.prepaid_weight_charge = val
    result.total_prepaid = val
    if (!result.total) result.total = val
  }

  const collectMatch = text.match(/Total\s+collect[:\s]+(\d[\d,]+\.?\d*)/i)
  if (collectMatch) {
    result.collect_weight_charge = parseFloat(collectMatch[1].replace(/,/g, ''))
    result.total_collect = parseFloat(collectMatch[1].replace(/,/g, ''))
  }

  // ── Описание товара ───────────────────────────────────────────────────────
  const goodsPatterns = [
    /Nature\s+and\s+Quantity\s+of\s+Goods[^\n]*\n([\s\S]{5,200}?)(?:Shipper certifies|Prepaid|Weight Charge|$)/i,
    /GOODS\s+DESCRIPTION[:\s]+([^\n]+)/i,
  ]
  for (const p of goodsPatterns) {
    const m = text.match(p)
    if (m) {
      result.goods_description = m[1].split('\n')
        .map(l => l.trim()).filter(Boolean).slice(0, 4).join('\n')
      break
    }
  }
  // Если не нашли блок — ищем типичные описания грузов
  if (!result.goods_description) {
    const goodsMatch = text.match(/\b(SPARE\s+PARTS?|ELECTRONICS?|CLOTHING|TEXTILES?|MACHINERY|AUTO\s+PARTS?)\b/i)
    if (goodsMatch) result.goods_description = goodsMatch[1]
  }

  // ── Volume CBM ────────────────────────────────────────────────────────────
  const volMatch = text.match(/VOL\.?\s*(\d+\.?\d*)\s*CBM/i)
    || text.match(/(\d+\.?\d*)\s*CBM/i)
    || text.match(/(\d+\.?\d*)\s*(?:M3|CBM|CUM)/i)
  if (volMatch) result.volume_cbm = parseFloat(volMatch[1])

  // ── Дата и место оформления ───────────────────────────────────────────────
  const execMatch = text.match(/(\d{1,2}[-–]\w{3}[-–]\d{4})\s+Time:\s*(\d{2}:\d{2}:\d{2})/i)
    || text.match(/(\d{1,2}[-/]\w{3,9}[-/]\d{4})/i)
  if (execMatch) {
    result.execution_date = execMatch[1]
    if (execMatch[2]) result.execution_time = execMatch[2]
  }

  // Место исполнения — обычно 3-буквенный код аэропорта
  const placeMatch = text.match(/at\s*\(place\)[:\s]+([A-Z]{3})/i)
    || text.match(/\b(DXB|DWC|AUH|SHJ|MCT|DOH|RUH|JED|KWI|BAH)\b/)
  if (placeMatch) result.execution_place = placeMatch[1]

  // ── Подписант ─────────────────────────────────────────────────────────────
  const signerMatch = text.match(/AGTALIB[A-Z]+-([A-Za-z\s]+?)(?:\n|$)/i)
    || text.match(/Signature\s+of\s+(?:Shipper|Issuing\s+Carrier)[^\n]*\n([^\n]{3,50})/i)
  if (signerMatch) result.signer_name = signerMatch[1].trim()

  // ── Rate class ────────────────────────────────────────────────────────────
  const rateClassMatch = text.match(/Rate\s+Class[:\s]+([A-Z])/i)
    || text.match(/\bClass\s+([KMQ])\b/i)
  if (rateClassMatch) result.rate_class = rateClassMatch[1]

  // ── Optional shipping info ────────────────────────────────────────────────
  const optMatch = text.match(/Optional\s+Shipping\s+Information[:\s]+([A-Z0-9]+)/i)
  if (optMatch) result.optional_shipping_info = optMatch[1]

  // ── Handling info ─────────────────────────────────────────────────────────
  const handlingMatch = text.match(/Handling\s+Information[:\s]+([^\n]+)/i)
  if (handlingMatch) result.handling_info = handlingMatch[1].trim()

  return result
}

// ── Вспомогательные функции ───────────────────────────────────────────────────

function extractAfterLabel(text: string, labels: string[], stopMarkers: string[]): string {
  for (const label of labels) {
    const idx = text.toLowerCase().indexOf(label.toLowerCase())
    if (idx === -1) continue

    let endIdx = text.length
    for (const stop of stopMarkers) {
      const si = text.toLowerCase().indexOf(stop.toLowerCase(), idx + label.length)
      if (si !== -1 && si < endIdx) endIdx = si
    }

    const block = text.slice(idx + label.length, endIdx).trim()
    if (block.length > 2) return block
  }
  return ''
}

function cleanLines(block: string): string[] {
  return block
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 1 && !/^[:\-–|]+$/.test(l))
    .slice(0, 5)
}
