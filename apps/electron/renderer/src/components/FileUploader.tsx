import { useRef, useState, useCallback } from 'react'
import { Upload, X, FileImage, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'

interface FileUploaderProps {
    onFilesSelected: (files: File[]) => void
    isUploading?: boolean
}

export function FileUploader({ onFilesSelected, isUploading = false }: FileUploaderProps) {
    const [isDragging, setIsDragging] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragging(true)
        } else if (e.type === 'dragleave') {
            setIsDragging(false)
        }
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const imageFiles = Array.from(e.dataTransfer.files).filter(file =>
                file.type.startsWith('image/')
            )
            if (imageFiles.length > 0) {
                onFilesSelected(imageFiles)
            }
        }
    }, [onFilesSelected])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onFilesSelected(Array.from(e.target.files))
        }
    }

    return (
        <div
            className={cn(
                "relative rounded-lg border-2 border-dashed transition-all duration-200 ease-in-out p-12 text-center",
                isDragging
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-300 hover:border-gray-400 bg-gray-50",
                isUploading && "pointer-events-none opacity-50"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
        >
            <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handleChange}
            />

            <div className="flex flex-col items-center justify-center gap-4">
                <div className="p-4 rounded-full bg-white shadow-sm ring-1 ring-gray-200">
                    {isUploading ? (
                        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                    ) : (
                        <Upload className="h-8 w-8 text-gray-500" />
                    )}
                </div>

                <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-700">
                        {isUploading ? 'Analizowanie harmonogramu...' : 'Kliknij, aby przesłać lub przeciągnij i upuść'}
                    </p>
                    <p className="text-xs text-gray-500">
                        Obsługuje JPG, PNG (maks. 10 MB)
                    </p>
                </div>

                <button
                    onClick={() => inputRef.current?.click()}
                    disabled={isUploading}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                    Select Files
                </button>
            </div>
        </div>
    )
}
