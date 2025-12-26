
import React, { useState } from 'react'
import axios from 'axios'
import { Play, CalendarCheck, Loader2, AlertTriangle, X, User, FileDown } from 'lucide-react'

interface DutyAssignment {
    teacher_code: string
    day: string
    break_id: string
    break_name: string
    break_index: number
    zone_id: string
    zone_name: string
    assign_status?: 'optimal' | 'warning' | 'critical'
    assign_logs?: string[]
}

interface SolutionStats {
    total_duties: number
    status_str: string
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const DAY_LABELS: Record<string, string> = {
    'Mon': 'Poniedziałek', 'Tue': 'Wtorek', 'Wed': 'Środa', 'Thu': 'Czwartek', 'Fri': 'Piątek'
}

export function GeneratorView() {
    const [assignments, setAssignments] = useState<DutyAssignment[]>([])
    const [stats, setStats] = useState<SolutionStats | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Inspector State
    const [selectedTeacher, setSelectedTeacher] = useState<string | null>(null)
    const [teacherData, setTeacherData] = useState<any>(null)
    const [loadingInspector, setLoadingInspector] = useState(false)
    const [zonesConfig, setZonesConfig] = useState<any[]>([])

    // Recover last session AND load config for proper sorting
    React.useEffect(() => {
        const init = async () => {
            // 1. Load Config for Zones Order
            try {
                const configRes = await axios.get('http://127.0.0.1:8765/api/config/duty_rules')
                if (configRes.data.value && configRes.data.value.zones) {
                    setZonesConfig(configRes.data.value.zones)
                }
            } catch (e) { console.error("Config load fail", e) }

            // 2. Restore Session
            // Don't overwrite if we already have something (rare but safe)
            if (assignments.length > 0) return

            try {
                const res = await axios.get('http://127.0.0.1:8765/api/config/last_generated_schedule')
                if (res.data.value && res.data.value.status === 'success') {
                    // console.log("Restoring session...", res.data.value)
                    setAssignments(res.data.value.solution)
                    setStats(res.data.value.stats)
                }
            } catch (e) {
                // Silent fail is fine, user just hasn't generated anything yet
            }
        }
        init()
    }, [])

    const handleExportPdf = async () => {
        if (assignments.length === 0) return
        try {
            // Optional: Start loading indicator if download takes time
            setLoadingInspector(true)

            // Build break labels map
            const labelsMap: Record<string, string> = {}
            assignments.forEach(a => {
                labelsMap[a.break_index] = a.break_name
            })

            const res = await axios.post('http://127.0.0.1:8765/api/solver/export/pdf', {
                assignments: assignments,
                zones: zonesConfig.map(z => z.name),
                break_labels: labelsMap
            }, {
                responseType: 'blob'
            })

            // Create download link
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Plan_Dyzurow_${new Date().toISOString().split('T')[0]}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (e) {
            console.error(e)
            alert("Błąd generowania PDF. Sprawdź logi backendu.")
        } finally {
            setLoadingInspector(false)
        }
    }

    const handleGenerate = async () => {
        setLoading(true)
        setError(null)
        setStats(null)
        setAssignments([])
        try {
            const res = await axios.post('http://127.0.0.1:8765/api/solver/generate')
            if (res.data.status === 'success') {
                setAssignments(res.data.solution)
                setStats(res.data.stats)
            } else {
                setError(res.data.message || 'Optimization failed')
            }
        } catch (e: any) {
            setError(e.response?.data?.detail || e.message)
        } finally {
            setLoading(false)
        }
    }

    const inspectTeacher = async (code: string) => {
        setSelectedTeacher(code)
        setLoadingInspector(true)
        setTeacherData(null)
        try {
            const res = await axios.get(`http://127.0.0.1:8765/api/schedule/${code}`)
            setTeacherData(res.data)
        } catch (e) {
            console.error(e)
        } finally {
            setLoadingInspector(false)
        }
    }

    // Helper to group by Break -> Zone -> Teachers (Full Objects)
    const getDutiesForSlot = (day: string, breakName: string) => {
        const duties = assignments.filter(a => a.day === day && a.break_name === breakName)
        // Group by zone
        const byZone: Record<string, DutyAssignment[]> = {}
        duties.forEach(d => {
            if (!byZone[d.zone_name]) byZone[d.zone_name] = []
            byZone[d.zone_name].push(d)
        })
        return byZone
    }

    // Extract unique breaks (in order of appearance sorted by index)
    const uniqueBreaks = Array.from(new Set(assignments.map(a => a.break_name)))
        .sort((a, b) => {
            const objA = assignments.find(x => x.break_name === a)
            const objB = assignments.find(x => x.break_name === b)
            const idxA = (objA as any)?.break_index ?? 999
            const idxB = (objB as any)?.break_index ?? 999
            return idxA - idxB
        })

    return (
        <div className="flex h-full overflow-hidden">
            {/* Main Content Area */}
            <div className="flex-1 flex flex-col p-8 min-w-0 transition-all duration-300">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-900">
                            <CalendarCheck className="text-blue-600" />
                            Generator Dyżurów
                        </h1>
                        <p className="text-gray-500 mt-1">Automatycznie przydzielaj nauczycieli na podstawie dostępności i reguł.</p>
                    </div>

                    <div className="flex items-center gap-4">
                        {stats && (
                            <div className="text-sm bg-green-50 text-green-700 px-4 py-2 rounded-lg border border-green-200">
                                <strong>Status:</strong> {stats.status_str} • <strong>Liczba Dyżurów:</strong> {stats.total_duties}
                            </div>
                        )}

                        <button
                            onClick={handleExportPdf}
                            disabled={loading || assignments.length === 0}
                            className="flex items-center gap-2 bg-white text-gray-700 px-6 py-3 rounded-xl font-bold hover:bg-gray-50 transition border border-gray-300 shadow-sm disabled:opacity-50"
                        >
                            <FileDown className="h-5 w-5" />
                            Eksport PDF
                        </button>

                        <button
                            onClick={handleGenerate}
                            disabled={loading}
                            className="flex items-center gap-2 bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg hover:shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5 fill-current" />}
                            {loading ? 'Optymalizowanie...' : 'GENERUJ DYŻURY'}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="mb-6 bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5" />
                        {error}
                    </div>
                )}

                {/* Results Matrix */}
                {assignments.length > 0 ? (
                    <div className="flex-1 overflow-auto bg-white rounded-xl border border-gray-200 shadow-sm relative">
                        <table className="w-full text-sm border-collapse min-w-[800px]">
                            {/* min-w ensures table doesn't collapse too much when inspector opens */}
                            <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-3 border-b border-r text-left w-32 font-bold text-gray-600 bg-gray-50">Dzień / Przerwa</th>
                                    {uniqueBreaks.map(b => (
                                        <th key={b} className="p-3 border-b text-center font-semibold text-gray-700 min-w-[150px]">
                                            {b}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {DAYS.map(day => (
                                    <tr key={day} className="border-b last:border-0 hover:bg-gray-50 transition">
                                        <td className="p-4 border-r font-bold text-gray-800 bg-gray-50/50">
                                            {DAY_LABELS[day]}
                                        </td>
                                        {uniqueBreaks.map(b => {
                                            const zoneMap = getDutiesForSlot(day, b)

                                            // STRICT ORDERING: Use zonesConfig as master list
                                            let renderKeys: string[] = []
                                            if (zonesConfig.length > 0) {
                                                const configNames = zonesConfig.map(z => z.name)
                                                // 1. Configured zones
                                                renderKeys = configNames.filter(name => zoneMap[name] && zoneMap[name].length > 0)
                                                // 2. Orphans (zones in schedule but not in current config)
                                                const orphans = Object.keys(zoneMap).filter(name => !configNames.includes(name))
                                                renderKeys = [...renderKeys, ...orphans]
                                            } else {
                                                // Fallback if config not loaded
                                                renderKeys = Object.keys(zoneMap).sort()
                                            }

                                            const hasDuties = renderKeys.length > 0

                                            return (
                                                <td key={`${day}-${b}`} className="p-3 align-top border-l">
                                                    {hasDuties ? (
                                                        <div className="space-y-2">
                                                            {renderKeys.map(zone => {
                                                                const teachers = zoneMap[zone]
                                                                return (
                                                                    <div key={zone} className="text-xs border border-blue-100 bg-blue-50/50 rounded p-1.5 hover:bg-blue-100 transition">
                                                                        <div className="font-semibold text-blue-800 mb-0.5">{zone}</div>
                                                                        <div className="flex flex-wrap gap-1">
                                                                            {teachers.map(tData => {
                                                                                let bg = "bg-green-100 border-green-200 text-green-800"
                                                                                if (tData.assign_status === 'warning') bg = "bg-yellow-100 border-yellow-200 text-yellow-800"
                                                                                if (tData.assign_status === 'critical') bg = "bg-red-100 border-red-200 text-red-800"

                                                                                // Highlight if selected
                                                                                const isSelected = selectedTeacher === tData.teacher_code
                                                                                if (isSelected) bg = "bg-blue-600 border-blue-700 text-white ring-2 ring-blue-300"

                                                                                return (
                                                                                    <button
                                                                                        key={tData.teacher_code}
                                                                                        onClick={() => inspectTeacher(tData.teacher_code)}
                                                                                        className={`${bg} border px-1.5 py-0.5 rounded font-bold text-xs cursor-pointer hover:scale-105 transition text-left`}
                                                                                        title={tData.assign_logs?.join(", ") || "Optymalnie"}
                                                                                    >
                                                                                        {tData.teacher_code}
                                                                                    </button>
                                                                                )
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <div className="text-center text-gray-300 text-xs italic">-</div>
                                                    )}
                                                </td>
                                            )
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    !loading && !error && (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                            <CalendarCheck className="h-16 w-16 mb-4 text-gray-300" />
                            <p className="text-lg font-medium">Brak wygenerowanych dyżurów.</p>
                            <p className="text-sm">Zdefiniuj reguły w ustawieniach, dodaj nauczycieli i kliknij Generuj.</p>
                        </div>
                    )
                )}
            </div>

            {/* Teacher Inspector Side Panel (Static, not fixed overlap) */}
            {selectedTeacher && (
                <div className="w-96 bg-white shadow-xl border-l border-gray-200 z-20 flex flex-col shrink-0 transition-all">
                    <div className="p-4 border-b flex items-center justify-between bg-gray-50">
                        <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                            <User className="h-5 w-5 text-blue-600" />
                            Nauczyciel: {selectedTeacher}
                        </h3>
                        <button onClick={() => setSelectedTeacher(null)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-200 rounded">
                            <X className="h-6 w-6" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        {loadingInspector ? (
                            <div className="flex justify-center p-8"><Loader2 className="animate-spin text-blue-500" /></div>
                        ) : teacherData ? (
                            <div className="space-y-6">
                                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-sm text-blue-800">
                                    Sprawdzanie planu pod kątem konfliktów i sal.
                                </div>

                                {DAYS.map(day => {
                                    // 1. Get Lessons
                                    const lessons = teacherData.schedule.filter((s: any) => s.day === day)
                                    // 2. Get Duties
                                    const duties = assignments.filter(a => a.teacher_code === selectedTeacher && a.day === day)

                                    if (lessons.length === 0 && duties.length === 0) return null

                                    // 3. Build Timeline (0 to 10 slots)
                                    const timeline = []
                                    const maxIdx = Math.max(
                                        ...lessons.map((l: any) => parseInt(l.lesson_index)),
                                        ...duties.map(d => d.break_index),
                                        8
                                    )

                                    for (let i = 0; i <= maxIdx; i++) {
                                        // Lesson at i
                                        const lesson = lessons.find((l: any) => parseInt(l.lesson_index) === i)
                                        if (lesson) timeline.push({ type: 'lesson', data: lesson, id: `l-${i}` })

                                        // Duty AFTER i
                                        const duty = duties.find(d => d.break_index === i)
                                        if (duty) timeline.push({ type: 'duty', data: duty, id: `d-${i}` })
                                    }

                                    return (
                                        <div key={day} className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                                            <div className="bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-500 uppercase flex justify-between">
                                                <span>{DAY_LABELS[day]}</span>
                                            </div>
                                            <div className="divide-y divide-gray-100 bg-white">
                                                {timeline.map((item) => {
                                                    if (item.type === 'lesson') {
                                                        const s = item.data
                                                        return (
                                                            <div key={item.id} className="px-3 py-2 text-sm flex justify-between items-center group hover:bg-gray-50">
                                                                <div className="flex items-center gap-3">
                                                                    <span className="font-mono text-gray-400 text-xs w-5 inline-block text-center bg-gray-100 rounded">
                                                                        {s.lesson_index}
                                                                    </span>
                                                                    <div className="flex flex-col">
                                                                        <span className="font-medium text-gray-900">{s.subject_code || 'Lekcja'} <span className="text-gray-500 text-xs">{s.group_code}</span></span>
                                                                    </div>
                                                                </div>
                                                                {s.room_code && (
                                                                    <div className="text-xs font-bold text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded shadow-sm">
                                                                        {s.room_code}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )
                                                    } else {
                                                        const d = item.data as DutyAssignment
                                                        let style = "bg-green-50 border-green-200 text-green-800"
                                                        if (d.assign_status === 'warning') style = "bg-yellow-50 border-yellow-200 text-yellow-800"
                                                        if (d.assign_status === 'critical') style = "bg-red-50 border-red-200 text-red-800"

                                                        const translatedReasons = d.assign_logs?.map(r => {
                                                            if (r.includes('Far')) return 'Za daleko'
                                                            if (r.includes('Check')) return 'Sprawdź lokalizację'
                                                            if (r.includes('Edge')) return 'Dyżur na krawędzi'
                                                            return r
                                                        })

                                                        return (
                                                            <div key={item.id} className={`px-3 py-2 text-sm flex flex-col gap-1 border-y ${style} bg-opacity-50`}>
                                                                <div className="flex justify-between items-center">
                                                                    <div className="flex items-center gap-2 font-bold">
                                                                        <CalendarCheck className="w-3 h-3" />
                                                                        DYŻUR: {d.zone_name}
                                                                    </div>
                                                                    <div className="text-xs opacity-75">{d.break_name}</div>
                                                                </div>
                                                                {/* Show Reasons if not optimal */}
                                                                {d.assign_status !== 'optimal' && translatedReasons && translatedReasons.length > 0 && (
                                                                    <div className="text-xs flex items-center gap-1 mt-1 font-medium">
                                                                        <AlertTriangle className="w-3 h-3" />
                                                                        {translatedReasons.join(", ")}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )
                                                    }
                                                })}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="text-red-500 text-center mt-10">Nie udało się pobrać planu.</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
