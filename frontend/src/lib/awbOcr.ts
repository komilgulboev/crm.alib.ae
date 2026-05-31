import Tesseract from 'tesseract.js'
import type { AWBData } from '../types'
import { parseAWBText } from './awbParser'

export interface OcrResult {
  text: string
  confidence: number
  awb: Partial<AWBData>
  method: 'tesseract' | 'pdf-text' | 'none'
}

/** Извлекает текст из PDF через pdf.js (текстовый слой — без OCR) */
async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')

  // Используем legacy worker совместимый с Vite bundler
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    // pdfjs-dist 4+ поставляет worker как отдельный файл
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString()
  }

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  let fullText = ''

  for (let pageNum = 1; pageNum <= Math.min(pdf.numPages, 3); pageNum++) {
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()

    // Группируем элементы по Y-позиции чтобы сохранить структуру строк
    const items = textContent.items as Array<{
      str: string
      transform: number[]
      width: number
      height: number
    }>

    // Сортируем по Y (сверху вниз), затем по X (слева направо)
    items.sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5]
      if (Math.abs(yDiff) > 3) return yDiff
      return a.transform[4] - b.transform[4]
    })

    let lastY = -1
    for (const item of items) {
      const y = Math.round(item.transform[5])
      if (lastY !== -1 && Math.abs(y - lastY) > 5) {
        fullText += '\n'
      }
      fullText += item.str + ' '
      lastY = y
    }
    fullText += '\n'
  }

  return fullText.trim()
}

/** Запускает Tesseract OCR на изображении */
async function extractTextFromImage(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ text: string; confidence: number }> {
  const result = await Tesseract.recognize(file, 'eng', {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100))
      }
    },
  })
  return {
    text: result.data.text,
    confidence: Math.round(result.data.confidence),
  }
}

/** Основная функция — определяет тип файла и запускает нужный метод */
export async function extractAWBFromFile(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<OcrResult> {
  try {
    if (isPDFFile(file)) {
      onProgress?.(20)
      const text = await extractTextFromPDF(file)
      onProgress?.(90)

      if (text.trim().length < 30) {
        // PDF без текстового слоя — скан внутри PDF
        return { text: '', confidence: 0, awb: {}, method: 'none' }
      }

      onProgress?.(100)
      return {
        text,
        confidence: 95, // текстовый слой — всегда точный
        awb: parseAWBText(text),
        method: 'pdf-text',
      }
    }

    if (isImageFile(file)) {
      const { text, confidence } = await extractTextFromImage(file, onProgress)
      return {
        text,
        confidence,
        awb: parseAWBText(text),
        method: 'tesseract',
      }
    }

    return { text: '', confidence: 0, awb: {}, method: 'none' }
  } catch (err) {
    console.error('AWB extraction error:', err)
    return { text: '', confidence: 0, awb: {}, method: 'none' }
  }
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

export function isPDFFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}
