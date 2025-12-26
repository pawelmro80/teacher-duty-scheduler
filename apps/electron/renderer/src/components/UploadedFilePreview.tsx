import { Trash2, FileImage, CheckCircle, AlertCircle } from 'lucide-react'

interface UploadedFilePreviewProps {
    files: File[]
    onRemove: (index: number) => void
    status?: 'idle' | 'uploading' | 'success' | 'error'
}

export function UploadedFilePreview({ files, onRemove, status = 'idle' }: UploadedFilePreviewProps) {
    if (files.length === 0) return null

    return (
        <div className="mt-6 space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Selected Files ({files.length})</h3>
            <div className="grid grid-cols-1 gap-3">
                {files.map((file, idx) => (
                    <div key={`${file.name}-${idx}`} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <div className="p-2 bg-gray-100 rounded-md">
                                <FileImage className="w-5 h-5 text-gray-600" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                                <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {status === 'success' && <CheckCircle className="w-5 h-5 text-green-500" />}
                            {status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}

                            {status === 'idle' && (
                                <button
                                    onClick={() => onRemove(idx)}
                                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
