import { useEffect } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'md' | 'lg' | 'xl'
}

export default function Modal({ open, onClose, title, children, size = 'lg' }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!open) return null

  const widths = { md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${widths[size]} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">{children}</div>
      </div>
    </div>
  )
}
