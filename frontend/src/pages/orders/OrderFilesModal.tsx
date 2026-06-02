import { X, ExternalLink, Download, FileText, File, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ordersApi } from '../../api/orders'
import type { Order, DocCategory } from '../../types'

interface Props {
  order: Order | null
  onClose: () => void
}

const CAT_LABELS: Record<DocCategory, string> = {
  invoice: 'Инвойс',
  packing_list: 'Packing List',
  boe: 'BOE файл',
}

function getFileName(url: string): string {
  try {
    const path = new URL(url).pathname
    return decodeURIComponent(path.split('/').pop() || 'file')
  } catch {
    return 'file'
  }
}

function getFileExt(url: string): string {
  const name = getFileName(url)
  const dot = name.lastIndexOf('.')
  return dot !== -1 ? name.slice(dot + 1).toUpperCase() : 'FILE'
}

async function downloadFile(url: string, filename: string) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    a.click()
    URL.revokeObjectURL(blobUrl)
  } catch {
    window.open(url, '_blank')
  }
}

export default function OrderFilesModal({ order, onClose }: Props) {
  const { t } = useTranslation()

  const { data: fullOrder, isLoading } = useQuery({
    queryKey: ['order-detail', order?.id],
    queryFn: () => ordersApi.get(order!.id).then(r => r.data),
    enabled: !!order,
  })

  if (!order) return null

  const display = fullOrder || order

  const allFiles: { label: string; category: string; url: string; fileName: string }[] = []

  // AWB документ
  if (display.awb?.file_url) {
    allFiles.push({
      label: 'AWB документ',
      category: 'AWB',
      url: display.awb.file_url,
      fileName: getFileName(display.awb.file_url),
    })
  }

  // Новые documents из таблицы
  for (const doc of display.documents || []) {
    allFiles.push({
      label: CAT_LABELS[doc.category] || doc.category,
      category: doc.category.toUpperCase(),
      url: doc.file_url,
      fileName: doc.file_name || getFileName(doc.file_url),
    })
  }

  // Старые boe_file_* (для обратной совместимости, если documents пусты)
  if (!display.documents?.length) {
    if (display.boe_file_1_url) allFiles.push({ label: 'Инвойс',       category: 'INV', url: display.boe_file_1_url, fileName: getFileName(display.boe_file_1_url) })
    if (display.boe_file_2_url) allFiles.push({ label: 'Packing List',  category: 'PL',  url: display.boe_file_2_url, fileName: getFileName(display.boe_file_2_url) })
    if (display.boe_file_3_url) allFiles.push({ label: 'BOE файл',      category: 'BOE', url: display.boe_file_3_url, fileName: getFileName(display.boe_file_3_url) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">{t('orders.invoice')}</h2>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{order.tracking_number}</p>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
            <X size={17} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 max-h-[420px] overflow-y-auto space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">{t('common.loading')}</span>
            </div>
          ) : allFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <File size={36} className="mb-2 opacity-30" />
              <p className="text-sm">Файлы не загружены</p>
            </div>
          ) : (
            allFiles.map((file, i) => {
              const ext = getFileExt(file.url)
              const isImage = ['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF'].includes(ext)
              return (
                <div key={i}
                  className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 hover:border-gray-200 transition group">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex flex-col items-center justify-center text-[9px] font-bold leading-tight gap-0.5
                    ${ext === 'PDF' ? 'bg-red-50 text-red-500' : isImage ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-500'}`}>
                    <FileText size={16} />
                    <span>{ext}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-700">{file.label}</p>
                    <p className="text-[11px] text-gray-400 truncate mt-0.5">{file.fileName}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition">
                    <a href={file.url} target="_blank" rel="noopener noreferrer" title={t('common.open')}
                      className="p-1.5 rounded-lg text-gray-500 hover:bg-white hover:text-gray-800 hover:shadow-sm transition">
                      <ExternalLink size={15} />
                    </a>
                    <button onClick={() => downloadFile(file.url, file.fileName)} title="Скачать"
                      className="p-1.5 rounded-lg text-blue-500 hover:bg-white hover:text-blue-700 hover:shadow-sm transition">
                      <Download size={15} />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {allFiles.length > 0 && (
          <div className="px-4 pb-4">
            <p className="text-[11px] text-gray-400 text-center">
              {allFiles.length} {allFiles.length === 1 ? 'файл' : allFiles.length < 5 ? 'файла' : 'файлов'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
