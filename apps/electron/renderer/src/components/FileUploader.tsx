import { useRef, useState, useCallback } from 'react'
import axios from 'axios'
import { Upload, X, FileImage, Loader2, FileText, Clipboard } from 'lucide-react'
import { cn } from '../lib/utils'

interface FileUploaderProps {
    onFilesSelected: (files: File[]) => void
    isUploading?: boolean
    onRefresh?: () => void
}


export function FileUploader({ onFilesSelected, isUploading = false, onRefresh }: FileUploaderProps) {
    const [mode, setMode] = useState<'ocr' | 'room'>('ocr')
    const [roomText, setRoomText] = useState('')
    const [roomCode, setRoomCode] = useState('')
    const [importingText, setImportingText] = useState(false)
    const [importResult, setImportResult] = useState<string | null>(null)
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

    const handleRoomImport = async () => {
        if (!roomText || !roomCode) return
        setImportingText(true)
        setImportResult(null)
        try {
            const res = await axios.post('http://127.0.0.1:8765/api/schedule/import-room', {
                text: roomText,
                room_code: roomCode
            })
            if (res.data.status === 'success') {
                setImportResult(`Sukces! Zaktualizowano ${res.data.teachers_updated.length} nauczycieli (${res.data.lessons_imported} lekcji).`)
                setRoomText('')
                // Trigger refresh if callback provided
                if (onRefresh) onRefresh()
            }
        } catch (e: any) {
            console.error(e)
            setImportResult(`Błąd: ${e.response?.data?.detail || e.message}`)
        } finally {
            setImportingText(false)
        }
    }

    return (
        <div className="w-full">
            {/* Tabs */}
            <div className="flex bg-gray-100 p-1 rounded-lg mb-4 w-fit">
                <button
                    onClick={() => setMode('ocr')}
                    className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${mode === 'ocr' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <FileImage className="w-4 h-4" />
                    Wyślij Pliki (OCR)
                </button>
                <button
                    onClick={() => setMode('room')}
                    className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${mode === 'room' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Clipboard className="w-4 h-4" />
                    Plan Sali (Tekst)
                </button>
            </div>

            {mode === 'ocr' ? (
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
                            Wybierz Pliki
                        </button>
                    </div>
                </div>
            ) : (
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Numer Sali</label>
                        <input
                            type="text"
                            className="w-full max-w-xs border rounded px-3 py-2 text-sm"
                            placeholder="np. 101, 203A"
                            value={roomCode}
                            onChange={(e) => setRoomCode(e.target.value)}
                        />
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Treść Planu (Skopiuj tabelę ze strony)</label>
                        <textarea
                            className="w-full border rounded-lg p-3 text-xs font-mono h-48 focus:ring-2 focus:ring-blue-500"
                            placeholder={"Nr\tGodz\tPoniedziałek\tWtorek\t...\n1\t7:45\tJZ 1I-1/2\t..."}
                            value={roomText}
                            onChange={(e) => setRoomText(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        {importResult && (
                            <div className={`text-sm ${importResult.includes('Błąd') ? 'text-red-600' : 'text-green-600 font-bold'}`}>
                                {importResult}
                            </div>
                        )}
                        <button
                            onClick={handleRoomImport}
                            disabled={importingText || !roomCode || !roomText}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {importingText && <Loader2 className="w-4 h-4 animate-spin" />}
                            Importuj
                        </button>
                    </div>

                    <div className="mt-4 text-xs text-gray-500 border-t pt-4">
                        <strong>Instrukcja:</strong>
                        <ul className="list-disc list-inside mt-1 space-y-1">
                            <li>Otwórz plan sali na stronie szkoły.</li>
                            <li>Zaznacz całą tabelę z lekcjami i skopiuj (Ctrl+C).</li>
                            <li>Upewnij się, że wpisałeś poprawny numer samej sali powyżej.</li>
                            <li>Kliknij Importuj. Dane zostaną doklejone do planów nauczycieli.</li>
                        </ul>
                    </div>
                </div>
            )}
        </div>
    )
}
