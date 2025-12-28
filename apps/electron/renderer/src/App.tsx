
import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { LayoutDashboard, Database, Upload as UploadIcon, Settings, CalendarCheck } from 'lucide-react'
import { FileUploader } from './components/FileUploader'
import { UploadedFilePreview } from './components/UploadedFilePreview'
import { ScheduleGrid, TeacherSchedule } from './components/ScheduleGrid'
import { TeachersList } from './components/TeachersList'
import { MergeModal } from './components/MergeModal'
import { DutySettings } from './components/DutySettings'
import { GeneratorView } from './components/GeneratorView'

import defaultLogo from './assets/logo.png'
import { Edit2 } from 'lucide-react'

interface OCRResult extends TeacherSchedule {
    origin?: 'upload' | 'database'
}

function App() {
    const [status, setStatus] = useState<string>('Connecting...')
    const [activeTab, setActiveTab] = useState<'upload' | 'database' | 'settings' | 'generator'>('upload')
    const [files, setFiles] = useState<File[]>([])
    const [isUploading, setIsUploading] = useState(false)
    const [results, setResults] = useState<OCRResult[]>([])

    // To trigger list refresh on save
    const [refreshDb, setRefreshDb] = useState(0)

    // Merge Conflict State
    const [conflictTeacher, setConflictTeacher] = useState<TeacherSchedule | null>(null)
    const [conflictTarget, setConflictTarget] = useState<any>(null)

    // Logo State
    const [logoSrc, setLogoSrc] = useState<string>(defaultLogo)

    useEffect(() => {
        const checkHealth = async () => {
            try {
                const res = await axios.get('http://127.0.0.1:8765/health')
                setStatus(`Connected (v${res.data.version})`)
            } catch (err) {
                setStatus('Disconnected')
            }
        }
        checkHealth()
        const interval = setInterval(checkHealth, 15000)
        return () => clearInterval(interval)
    }, [])

    // Fetch Logo
    useEffect(() => {
        const fetchLogo = async () => {
            try {
                const res = await axios.get('http://127.0.0.1:8765/api/config/school_logo')
                if (res.data.value) {
                    setLogoSrc(res.data.value)
                }
            } catch (e) {
                // Ignore, use default
            }
        }
        fetchLogo()
    }, [])

    const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return
        const file = e.target.files[0]

        // Convert to Base64
        const reader = new FileReader()
        reader.onloadend = async () => {
            const base64 = reader.result as string
            setLogoSrc(base64) // Optimistic update

            // Save to DB
            try {
                await axios.post('http://127.0.0.1:8765/api/config/save', {
                    key: 'school_logo',
                    value: base64
                })
            } catch (err) {
                console.error("Failed to save logo", err)
                alert("Błąd zapisu loga!")
            }
        }
        reader.readAsDataURL(file)
    }

    const handleFilesSelected = (newFiles: File[]) => {
        setFiles(prev => [...prev, ...newFiles])
    }

    const handleRemoveFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index))
    }

    const handleProcess = async () => {
        if (files.length === 0) return
        setIsUploading(true)

        // Process sequentially
        const queue = [...files]
        for (const file of queue) {
            try {
                const formData = new FormData()
                formData.append('file', file)

                const response = await axios.post('http://127.0.0.1:8765/api/ocr/analyze', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    timeout: 60000
                })

                setResults(prev => [...prev, { ...response.data, origin: 'upload' }])
                setFiles(prev => prev.filter(f => f !== file))

            } catch (error: any) {
                console.error('Processing failed for file:', file.name, error)
            }
        }
        setIsUploading(false)
    }

    const performSave = async (scheduleData: TeacherSchedule) => {
        try {
            await axios.post('http://127.0.0.1:8765/api/schedule/save', scheduleData)
            setRefreshDb(prev => prev + 1)
            setResults(prev => prev.map(r =>
                r.teacher_code === scheduleData.teacher_code ? { ...r, origin: 'database' } : r
            ))
        } catch (e: any) {
            console.error(e)
            alert('Failed to save: ' + e.message)
            throw e
        }
    }

    const handleSaveAttempt = async (updated: OCRResult) => {
        try {
            if (updated.origin === 'database') {
                await performSave(updated)
                return
            }

            try {
                const existing = await axios.get(`http://127.0.0.1:8765/api/schedule/${updated.teacher_code}`)
                if (existing.data.is_verified) {
                    setConflictTeacher(updated)
                    setConflictTarget(existing.data)
                    return
                }
            } catch (e) {
                // 404
            }
            await performSave(updated)
            alert('Schedule Saved Successfully! ✅')
        } catch (e: any) {
            alert('Check failed: ' + e.message)
        }
    }

    const handleMerge = async () => {
        if (!conflictTeacher || !conflictTarget) return

        const slotMap = new Map<string, any>()
        conflictTarget.schedule.forEach((slot: any) => {
            const key = `${slot.day}-${slot.lesson_index}`
            slotMap.set(key, slot)
        })
        conflictTeacher.schedule.forEach((newSlot: any) => {
            const key = `${newSlot.day}-${newSlot.lesson_index}`
            slotMap.set(key, newSlot)
        })
        const mergedSlots = Array.from(slotMap.values())
        const mergedSchedule: OCRResult = {
            ...conflictTeacher,
            schedule: mergedSlots,
            origin: 'upload'
        }
        setResults(prev => prev.map(r =>
            r.teacher_code === conflictTeacher.teacher_code ? mergedSchedule : r
        ))
        setConflictTeacher(null)
        setConflictTarget(null)
        alert('Merged! Please review and save.')
    }

    const handleSelectTeacher = async (code: string) => {
        try {
            const res = await axios.get(`http://127.0.0.1:8765/api/schedule/${code}`)
            setResults([{ ...res.data, origin: 'database' }])
            setActiveTab('upload')
        } catch (e: any) {
            alert(e.message)
        }
    }

    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Collapsible Sidebar */}
            <div className={`${isSidebarCollapsed ? 'w-20' : 'w-64'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300 relative`}>
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    {!isSidebarCollapsed && (
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                <LayoutDashboard className="text-blue-600" />
                                Planer Dyżurów
                            </h1>
                            <div className="mt-2 text-xs flex items-center gap-2 text-gray-500">
                                <span className={`h-2 w-2 rounded-full ${status.includes('Connected') ? 'bg-green-500' : 'bg-red-500'}`} />
                                {status.includes('Connected') ? 'Połączono' : 'Rozłączono'}
                            </div>
                        </div>
                    )}
                    {isSidebarCollapsed && (
                        <div className="w-full flex justify-center mb-2">
                            <span className={`h-2 w-2 rounded-full ${status.includes('Connected') ? 'bg-green-500' : 'bg-red-500'}`} title={status} />
                        </div>
                    )}

                    <button
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 absolute right-2 top-6"
                        title={isSidebarCollapsed ? "Rozwiń Menu" : "Zwiń Menu"}
                    >
                        {isSidebarCollapsed ? <LayoutDashboard className="w-5 h-5" /> : <div className="text-gray-400">«</div>}
                    </button>

                </div>

                <nav className="flex-1 p-4 space-y-2">
                    {[
                        { id: 'upload', icon: UploadIcon, label: 'Import Danych' },
                        { id: 'database', icon: Database, label: 'Baza Nauczycieli' },
                        { id: 'settings', icon: Settings, label: 'Ustawienia Dyżurów' },
                        { id: 'generator', icon: CalendarCheck, label: 'Generator' }
                    ].map(item => (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id as any)}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors 
                                ${activeTab === item.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}
                                ${isSidebarCollapsed ? 'justify-center' : ''}
                            `}
                            title={isSidebarCollapsed ? item.label : ''}
                        >
                            <item.icon className="h-5 w-5 shrink-0" />
                            {!isSidebarCollapsed && <span>{item.label}</span>}
                        </button>
                    ))}
                </nav>

                {/* Logo Footer */}
                <div className={`p-4 border-t border-gray-100 flex justify-center items-center ${isSidebarCollapsed ? 'py-4' : 'py-6'} relative group`}>
                    <img
                        src={logoSrc}
                        alt="Logo Szkoły"
                        className={`transition-all duration-300 object-contain ${isSidebarCollapsed ? 'w-10 h-10' : 'w-24 h-24'}`}
                    />

                    {!isSidebarCollapsed && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors rounded-lg cursor-pointer"
                            title="Kliknij, aby zmienić logo (Zalecane 200x200px)"
                            onClick={() => document.getElementById('logo-upload')?.click()}
                        >
                            <Edit2 className="text-gray-700 opacity-0 group-hover:opacity-100" />
                            <input
                                id="logo-upload"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleLogoChange}
                            />
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-auto h-screen">
                {/* h-screen to allow generator scroll */}
                {/* Generator gets full width, others get constrained width */}
                <div className={`${activeTab === 'generator' ? 'w-full h-full' : 'max-w-7xl mx-auto p-8 h-full flex flex-col'}`}>

                    {activeTab === 'upload' && (
                        <div className="space-y-8">
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                <h2 className="text-lg font-semibold mb-4">Importuj Dane</h2>
                                <FileUploader
                                    onFilesSelected={handleFilesSelected}
                                    isUploading={false}
                                    onRefresh={() => setRefreshDb(prev => prev + 1)}
                                />

                                <UploadedFilePreview
                                    files={files}
                                    onRemove={handleRemoveFile}
                                    status={isUploading ? 'uploading' : 'idle'}
                                />

                                {files.length > 0 && (
                                    <div className="mt-6 flex justify-end items-center gap-4">
                                        {isUploading && <span className="text-sm text-blue-600 animate-pulse font-medium">Processing queue... ({files.length} remaining)</span>}
                                        <button
                                            onClick={handleProcess}
                                            disabled={isUploading}
                                            className={`px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition shadow-sm ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            {isUploading ? 'Processing...' : `Analyze ${files.length} Schedule${files.length > 1 ? 's' : ''}`}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {results.length > 0 && (
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-xl font-semibold">Active Editor ({results.length})</h2>
                                        <button onClick={() => setResults([])} className="text-sm text-gray-500 hover:text-gray-700">Clear All</button>
                                    </div>
                                    <div className="grid grid-cols-1 gap-8">
                                        {results.map((res, idx) => (
                                            <div key={idx} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                                <ScheduleGrid data={res} onSave={handleSaveAttempt} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'database' && (
                        <TeachersList onSelect={handleSelectTeacher} refreshTrigger={refreshDb} />
                    )}

                    {activeTab === 'settings' && <DutySettings />}

                    {activeTab === 'generator' && <GeneratorView />}

                </div>
            </div>

            <MergeModal
                isOpen={!!conflictTeacher}
                teacherCode={conflictTeacher?.teacher_code || ''}
                onClose={() => setConflictTeacher(null)}
                onMerge={handleMerge}
                onRename={() => {
                    alert('Please change the Teacher Code.')
                    setConflictTeacher(null)
                }}
            />
        </div>
    )
}

export default App
