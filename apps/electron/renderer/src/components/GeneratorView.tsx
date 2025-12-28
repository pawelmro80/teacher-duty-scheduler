
import React, { useState, useMemo, useEffect } from 'react'
import axios from 'axios'
import { Play, CalendarCheck, Loader2, AlertTriangle, X, User, FileDown, Lock, Unlock, Trash2, LayoutGrid, Calendar, ChevronDown } from 'lucide-react'
import { DndContext, DragEndEvent, DragOverlay, useSensor, useSensors, PointerSensor, useDraggable, useDroppable } from '@dnd-kit/core'

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

    // V1.1 State
    is_pinned?: boolean
    is_manual?: boolean
}

interface SolutionStats {
    total_duties: number
    status_str: string
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const DAY_LABELS: Record<string, string> = {
    'Mon': 'Poniedziałek', 'Tue': 'Wtorek', 'Wed': 'Środa', 'Thu': 'Czwartek', 'Fri': 'Piątek'
}

interface DraggableData {
    day: string
    breakIndex: number
    zone: string
    teacherCode: string
}

/**
 * Main Interactive Scheduling Interface.
 * 
 * Features:
 * - Drag & Drop Duty Assignment (dnd-kit).
 * - Visual Pinning/Unpinning of duties (Syncs with DB).
 * - Automatic Solver Triggering.
 * - Conflict Detection & Visualization.
 * - PDF Export (Zone-centric).
 */
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
    const [breaksConfig, setBreaksConfig] = useState<any[]>([])
    const [showExportMenu, setShowExportMenu] = useState(false)

    // View State
    const [viewMode, setViewMode] = useState<'week' | 'zone'>('week')
    const [activeDay, setActiveDay] = useState<string>('Mon')

    // Recover last session AND load config for proper sorting
    React.useEffect(() => {
        const init = async () => {
            // 1. Load Config for Zones Order
            try {
                const configRes = await axios.get('http://127.0.0.1:8765/api/config/duty_rules')
                if (configRes.data.value && configRes.data.value.zones) {
                    setZonesConfig(configRes.data.value.zones)
                }
                if (configRes.data.value && configRes.data.value.breaks) {
                    setBreaksConfig(configRes.data.value.breaks)
                }
            } catch (e) { console.error("Config load fail", e) }

            // 2. Restore Session (Draft > Backend)
            // Restore from LocalStorage first (Draft)
            const draft = localStorage.getItem('duty_scheduler_draft')
            if (draft) {
                try {
                    const parsed = JSON.parse(draft)
                    if (parsed && Array.isArray(parsed) && parsed.length > 0) {
                        setAssignments(parsed)
                        // If we have stats logic stored? Stats separate. 
                        // Maybe store object { assignments, stats }?
                        // For now just assignments.
                        return
                    }
                } catch (e) { console.error("Draft parse fail", e) }
            }

            // Fallback: Backend "Last Generated"
            if (assignments.length > 0) return
            try {
                const res = await axios.get('http://127.0.0.1:8765/api/config/last_generated_schedule')
                if (res.data.value && res.data.value.status === 'success') {
                    setAssignments(res.data.value.solution)
                    setStats(res.data.value.stats)
                }
            } catch (e) {
                // Silent fail
            }
        }
        init()
    }, [])

    // Initial Load - Fetch manual duties from DB to sync pins
    useEffect(() => {
        const fetchManualDuties = async () => {
            // Only fetch if assignments are empty or we want to sync
            if (zonesConfig.length === 0) return

            try {
                const res = await axios.get('http://127.0.0.1:8765/api/schedule/list')
                const teachers = res.data

                const dbAssignments: DutyAssignment[] = []

                teachers.forEach((t: any) => {
                    if (t.manual_duties_json) {
                        let manuals = t.manual_duties_json
                        if (typeof manuals === 'string') {
                            try { manuals = JSON.parse(manuals) } catch (e) { manuals = [] }
                        }

                        manuals.forEach((m: any) => {
                            // Match Zone ID -> Name using loaded Config
                            const matchedZone = zonesConfig.find(z => String(z.id) === String(m.zone_id))
                            const zName = matchedZone ? matchedZone.name : (m.zone_name || m.zone_id)

                            dbAssignments.push({
                                teacher_code: t.teacher_code,
                                day: m.day,
                                break_index: m.break_index,
                                zone_name: zName,
                                break_name: `Przerwa ${m.break_index}`,
                                break_id: String(m.break_index),
                                zone_id: m.zone_id,

                                is_manual: true,
                                is_pinned: true,
                                assign_status: 'warning',
                                assign_logs: ['Manual DB']
                            })
                        })
                    }
                })

                if (dbAssignments.length > 0) {
                    setAssignments(prev => {
                        const map = new Map()
                        prev.forEach(p => map.set(`${p.day}-${p.break_index}-${p.teacher_code}`, p))
                        dbAssignments.forEach(dbA => {
                            map.set(`${dbA.day}-${dbA.break_index}-${dbA.teacher_code}`, dbA)
                        })
                        return Array.from(map.values())
                    })
                }
            } catch (e) {
                console.error("Failed to sync manual duties", e)
            }
        }
        fetchManualDuties()
    }, [zonesConfig])

    // Auto-Save Draft (Replacing existing useEffect)
    React.useEffect(() => {
        if (assignments.length > 0) {
            localStorage.setItem('duty_scheduler_draft', JSON.stringify(assignments))
        }
    }, [assignments])

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

    const handleExportPdfZone = async () => {
        if (assignments.length === 0) return
        try {
            setLoadingInspector(true)

            // Config for Zone Order
            const configRes = await axios.get('http://127.0.0.1:8765/api/config/duty_rules')
            const zonesList = configRes.data.value?.zones?.map((z: any) => z.name) || []

            // Build break labels
            const labelsMap: Record<string, string> = {}
            assignments.forEach(a => {
                labelsMap[a.break_index] = a.break_name
            })

            const res = await axios.post('http://127.0.0.1:8765/api/solver/export/pdf-zone', {
                assignments: assignments,
                zones: zonesList,
                break_labels: labelsMap
            }, {
                responseType: 'blob'
            })

            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Plan_Dyzurow_Sektory_${new Date().toISOString().split('T')[0]}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (e) {
            console.error(e)
            alert("Błąd generowania PDF (Sektory). Sprawdź backend.")
        } finally {
            setLoadingInspector(false)
        }
    }

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // Require movement to start drag (avoids accidental clicks)
            },
        })
    )

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (!over) return

        // Source Data
        const sourceData = active.data.current as any
        if (!sourceData) return

        // Target Data
        const targetData = over.data.current as { day: string, breakIndex: number, zone: string } | undefined
        if (!targetData) return

        const { day: sDay, breakIndex: sIdx, zone: sZone, teacherCode: sCode } = sourceData
        const { day: tDay, breakIndex: tIdx, zone: tZone } = targetData

        // Same slot? Ignore
        if (sDay === tDay && sIdx === tIdx && sZone === tZone) return

        // Find Assignment
        const sourceAssignmentIndex = assignments.findIndex(a =>
            a.day === sDay && a.break_index === sIdx && a.zone_name === sZone && a.teacher_code === sCode
        )
        if (sourceAssignmentIndex === -1) return

        // Deep Clone
        const newAssignments = [...assignments]
        const sourceAssignment = { ...newAssignments[sourceAssignmentIndex] }

        // --- SWAP LOGIC ---
        // Check if anyone is in the target slot
        const targetOccupantsIndices = newAssignments
            .map((a, idx) => ({ ...a, originalIdx: idx }))
            .filter(a => a.day === tDay && a.break_index === tIdx && a.zone_name === tZone)

        // If exactly one person is there, SWAP with them
        if (targetOccupantsIndices.length === 1) {
            const targetOccupant = targetOccupantsIndices[0]
            const targetOccupantIndex = targetOccupant.originalIdx

            // Move Target -> Source
            const swappedTarget = { ...newAssignments[targetOccupantIndex] }
            swappedTarget.day = sDay
            swappedTarget.break_index = sIdx
            swappedTarget.zone_name = sZone
            swappedTarget.break_name = sourceAssignment.break_name
            swappedTarget.break_id = sourceAssignment.break_id

            swappedTarget.is_manual = true
            swappedTarget.assign_logs = [...(swappedTarget.assign_logs || []), 'Swapped']

            newAssignments[targetOccupantIndex] = swappedTarget
        }

        // Move Source -> Target
        sourceAssignment.day = tDay
        sourceAssignment.break_index = tIdx
        sourceAssignment.zone_name = tZone

        // Update break meta based on target (we infer from existing valid assignments in that slot or keep old if we can't find reference? 
        // Better: We should have a lookup for break names.
        // Fallback: If swapping, we took their break name? No we need the name for the NEW time.
        // Let's find ANY assignment at tIdx to get the name.
        const referenceAtTarget = assignments.find(a => a.break_index === tIdx)
        if (referenceAtTarget) {
            sourceAssignment.break_name = referenceAtTarget.break_name
            sourceAssignment.break_id = referenceAtTarget.break_id
        }

        sourceAssignment.is_manual = true
        sourceAssignment.is_pinned = true
        sourceAssignment.assign_status = 'warning'
        sourceAssignment.assign_logs = [...(sourceAssignment.assign_logs || []), 'Manual Move']

        newAssignments[sourceAssignmentIndex] = sourceAssignment

        setAssignments(newAssignments)
    }


    const handleGenerate = async () => {
        setLoading(true)
        setError(null)
        // Keep stats? Maybe clear.

        // Collect Pinned Items
        const pinned = assignments.filter(a => a.is_pinned).map(a => ({
            teacher_code: a.teacher_code,
            day: a.day,
            break_index: a.break_index,
            zone_name: a.zone_name
        }))

        // Don't clear assignments immediately if regenerating with pins to avoid flicker?
        // setAssignments([]) 

        try {
            const res = await axios.post('http://127.0.0.1:8765/api/solver/generate', {
                pinned_assignments: pinned
            })
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

    /**
     * Toggles the Pinned state of a duty assignment.
     * 
     * Logic:
     * 1. Optimistic UI Update: Immediately flips the lock icon.
     * 2. Atomic Backend Sync: Sends 'add' or 'remove' manual duty command to API.
     * 
     * This ensures the Teacher's individual schedule is always in sync with these pins.
     */
    const togglePin = async (day: string, bIdx: number, zone: string, tCode: string) => {
        // 1. Optimistic Update
        let action = 'remove'

        // Lookup Zone ID from Config
        const foundZone = zonesConfig.find(z => z.name === zone)
        let zoneId = foundZone?.id || zone

        setAssignments(prev => prev.map(a => {
            if (a.day === day && a.break_index === bIdx && a.zone_name === zone && a.teacher_code === tCode) {
                const newPinned = !a.is_pinned
                action = newPinned ? 'add' : 'remove'
                if (!a.zone_id) a.zone_id = zoneId

                return {
                    ...a,
                    is_pinned: newPinned,
                    is_manual: newPinned ? true : a.is_manual,
                    assign_status: newPinned ? 'warning' : a.assign_status,
                    assign_logs: newPinned ? [...(a.assign_logs || []), 'Manual Pin'] : a.assign_logs
                }
            }
            return a
        }))

        // 2. Sync with Backend
        try {
            await axios.post('http://127.0.0.1:8765/api/schedule/manual-duty', {
                teacher_code: tCode,
                day: day,
                break_index: bIdx,
                zone_id: zoneId,
                action: action
            })
        } catch (e) {
            console.error("Failed to sync pin to DB", e)
            alert("Błąd synchronizacji z bazą danych! Zmiana może nie zostać zapisana trwale.")
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
    // Extract unique breaks (Prefer Config > Derived)
    const uniqueBreaks = useMemo(() => {
        if (breaksConfig.length > 0) {
            // Use config order
            return breaksConfig.map(b => ({
                name: b.name || `Po ${b.afterLesson}`,
                index: b.afterLesson, // Assuming break ID maps to/contains lesson info or we rely on sort order
                id: b.id
            })).sort((a, b) => a.index - b.index)
        }

        // Fallback (Legacy)
        return Array.from(new Set(assignments.map(a => a.break_name)))
            .map(name => {
                const match = assignments.find(a => a.break_name === name)
                return { name, index: match?.break_index ?? 0 }
            })
            .sort((a, b) => a.index - b.index)
    }, [assignments, breaksConfig])

    // Slot Editor State
    const [editingSlot, setEditingSlot] = useState<{ day: string, breakIndex: number, zone: string, assignments: DutyAssignment[] } | null>(null)
    const [candidates, setCandidates] = useState<any[]>([])
    const [loadingCandidates, setLoadingCandidates] = useState(false)

    const loadCandidates = async (day: string, bIdx: number, zone: string) => {
        setLoadingCandidates(true)
        setCandidates([])
        try {
            const res = await axios.post('http://127.0.0.1:8765/api/solver/candidates', {
                day: day,
                break_index: bIdx,
                zone_name: zone
            })
            setCandidates(res.data)
        } catch (e) {
            console.error("Failed to load candidates", e)
        } finally {
            setLoadingCandidates(false)
        }
    }

    const openSlotEditor = (day: string, bIdx: number, zone: string) => {
        const inSlot = assignments.filter(a => a.day === day && a.break_index === bIdx && a.zone_name === zone)
        setEditingSlot({ day, breakIndex: bIdx, zone, assignments: inSlot })
        loadCandidates(day, bIdx, zone)
    }

    const handleManualAdd = (tCode: string) => {
        if (!editingSlot) return
        if (editingSlot.assignments.find(a => a.teacher_code === tCode)) return

        const ref = assignments.find(a => a.break_index === editingSlot.breakIndex)

        const newAsg: DutyAssignment = {
            teacher_code: tCode,
            day: editingSlot.day,
            break_index: editingSlot.breakIndex,
            zone_name: editingSlot.zone,
            break_name: ref?.break_name || `Przerwa ${editingSlot.breakIndex}`,
            break_id: ref?.break_id || String(editingSlot.breakIndex),
            zone_id: ref?.zone_id || 'unk',

            is_manual: true,
            is_pinned: true,
            assign_status: 'warning', // Manual is always at least warning/override
            assign_logs: ['Manual Add']
        }

        const next = [...assignments, newAsg]
        setAssignments(next)
        setEditingSlot(prev => prev ? ({ ...prev, assignments: [...prev.assignments, newAsg] }) : null)
    }

    const handleManualRemove = (tCode: string) => {
        const next = assignments.filter(a => !(a.day === editingSlot?.day && a.break_index === editingSlot?.breakIndex && a.zone_name === editingSlot?.zone && a.teacher_code === tCode))
        setAssignments(next)
        setEditingSlot(prev => prev ? ({ ...prev, assignments: prev.assignments.filter(a => a.teacher_code !== tCode) }) : null)
    }

    return (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div className="flex h-full overflow-hidden relative">
                {/* Main Content Area */}
                <div className="flex-1 flex flex-col p-8 min-w-0 transition-all duration-300">
                    {/* ... (Header) ... */}

                    {/* SLOT EDITOR MODAL */}
                    {editingSlot && (
                        <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
                            <div className="bg-white rounded-xl shadow-2xl w-[600px] flex flex-col max-h-[85vh]">
                                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                                    <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                                        <div className="bg-blue-100 p-1.5 rounded text-blue-600"><CalendarCheck className="w-5 h-5" /></div>
                                        Edycja Dyżuru
                                    </h3>
                                    <button onClick={() => setEditingSlot(null)} className="p-1 hover:bg-gray-200 rounded text-gray-500"><X className="w-5 h-5" /></button>
                                </div>
                                <div className="p-4 bg-gray-50 border-b text-sm grid grid-cols-2 gap-4">
                                    <div>
                                        <span className="text-gray-500 block text-xs uppercase">Dzień</span>
                                        <span className="font-semibold text-gray-900">{DAY_LABELS[editingSlot.day]}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500 block text-xs uppercase">Strefa</span>
                                        <span className="font-semibold text-gray-900">{editingSlot.zone}</span>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 max-h-[60vh]">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Przypisani Nauczyciele</h4>

                                    {editingSlot.assignments.length === 0 ? (
                                        <div className="text-gray-400 italic text-center py-4 border-2 border-dashed rounded-lg mb-4">Pusto</div>
                                    ) : (
                                        <div className="space-y-2 mb-6">
                                            {editingSlot.assignments.map(a => (
                                                <div key={a.teacher_code} className="flex justify-between items-center bg-white p-2 border rounded shadow-sm">
                                                    <div className="flex items-center gap-2 font-medium">
                                                        <User className="w-4 h-4 text-gray-400" />
                                                        {a.teacher_code}
                                                    </div>
                                                    <button
                                                        onClick={() => handleManualRemove(a.teacher_code)}
                                                        className="text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors"
                                                        title="Usuń z dyżuru"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Dodaj Nauczyciela (Wg Dopasowania)</h4>
                                    <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto bg-white">
                                        {loadingCandidates ? (
                                            <div className="p-8 flex justify-center text-gray-400">
                                                <Loader2 className="animate-spin w-8 h-8" />
                                            </div>
                                        ) : (
                                            candidates.map(c => {
                                                const isAssigned = editingSlot.assignments.some(a => a.teacher_code === c.teacher_code)
                                                // Colorize based on status
                                                let borderClass = "border-l-4 border-l-transparent"
                                                if (c.status === 'OK') borderClass = "border-l-4 border-l-green-400 bg-green-50/30"
                                                if (c.status === 'WARNING') borderClass = "border-l-4 border-l-yellow-400 bg-yellow-50/30"
                                                if (c.status === 'BUSY') borderClass = "border-l-4 border-l-red-400 bg-red-50/30 opacity-60"

                                                return (
                                                    <button
                                                        key={c.teacher_code}
                                                        onClick={() => !isAssigned && handleManualAdd(c.teacher_code)}
                                                        className={`w-full text-left p-3 text-sm flex justify-between items-center hover:bg-gray-50 border-b last:border-0 ${isAssigned ? 'opacity-40 cursor-not-allowed bg-gray-100' : ''} ${borderClass}`}
                                                    >
                                                        <div className="flex flex-col">
                                                            <span className="font-semibold flex items-center gap-2">
                                                                {c.teacher_code}
                                                                <span className="font-normal text-gray-500 text-xs">({c.teacher_name})</span>
                                                            </span>
                                                            {c.reason && (
                                                                <span className="text-[10px] text-gray-400 mt-0.5">{c.reason}</span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <div className="text-right">
                                                                <span className={`text-xs font-bold ${c.score > 80 ? 'text-green-600' : c.score < 0 ? 'text-red-500' : 'text-yellow-600'}`}>
                                                                    {c.score} pkt
                                                                </span>
                                                            </div>
                                                            {isAssigned && <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">Przypisany</span>}
                                                        </div>
                                                    </button>
                                                )
                                            })
                                        )}
                                    </div>
                                </div>
                                <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-end">
                                    <button
                                        onClick={() => setEditingSlot(null)}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                                    >
                                        Gotowe
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
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

                            <div className="relative">
                                <button
                                    onClick={() => setShowExportMenu(!showExportMenu)}
                                    disabled={loading || assignments.length === 0}
                                    className="flex items-center gap-2 bg-white text-gray-700 px-4 py-3 rounded-xl font-bold hover:bg-gray-50 transition border border-gray-300 shadow-sm disabled:opacity-50 text-sm"
                                >
                                    <FileDown className="h-5 w-5" />
                                    Eksport
                                    <ChevronDown className="h-4 w-4 ml-1" />
                                </button>

                                {showExportMenu && (
                                    <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-20">
                                        <button
                                            onClick={() => { handleExportPdf(); setShowExportMenu(false) }}
                                            className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm font-medium flex items-center gap-2"
                                        >
                                            PDF (Dni)
                                        </button>
                                        <button
                                            onClick={() => { handleExportPdfZone(); setShowExportMenu(false) }}
                                            className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm font-medium flex items-center gap-2 border-t"
                                        >
                                            PDF (Sektory)
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="w-px h-8 bg-gray-300 mx-2"></div>

                            <button
                                onClick={() => {
                                    if (confirm("Czy na pewno chcesz wyczyścić plan? Wszystkie dyżury (oprócz zakłódkowanych) zostaną usunięte.")) {
                                        setAssignments(prev => prev.filter(a => a.is_pinned))
                                        setStats(null)
                                    }
                                }}
                                disabled={loading || assignments.length === 0}
                                className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-3 rounded-xl font-bold hover:bg-red-100 transition border border-red-200 shadow-sm disabled:opacity-50 text-sm"
                            >
                                <Trash2 className="h-5 w-5" />
                                Wyczyść Grafik
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

                    {/* View Controls & Tabs */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button
                                onClick={() => setViewMode('week')}
                                className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${viewMode === 'week' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <Calendar className="w-4 h-4" />
                                Widok Tygodniowy
                            </button>
                            <button
                                onClick={() => setViewMode('zone')}
                                className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${viewMode === 'zone' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <LayoutGrid className="w-4 h-4" />
                                Widok Sektorowy
                            </button>
                        </div>

                        {viewMode === 'zone' && (
                            <div className="flex gap-2">
                                {DAYS.map(d => (
                                    <button
                                        key={d}
                                        onClick={() => setActiveDay(d)}
                                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeDay === d ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}
                                    >
                                        {DAY_LABELS[d]}
                                    </button>
                                ))}
                            </div>
                        )}
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
                                        <th className="p-3 border-b border-r text-left w-32 font-bold text-gray-600 bg-gray-50">
                                            {viewMode === 'week' ? 'Dzień / Przerwa' : 'Strefa / Przerwa'}
                                        </th>
                                        {uniqueBreaks.map((bObj: { name: string, index: number }) => (
                                            <th key={bObj.name} className="p-3 border-b text-center font-semibold text-gray-700 min-w-[150px]">
                                                {bObj.name}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {viewMode === 'week' ? (
                                        // WEEK VIEW (Rows = Days)
                                        DAYS.map(day => (
                                            <tr key={day} className="border-b last:border-0 hover:bg-gray-50 transition">
                                                <td className="p-4 border-r font-bold text-gray-800 bg-gray-50/50">
                                                    {DAY_LABELS[day]}
                                                </td>
                                                {uniqueBreaks.map((bObj: { name: string, index: number }) => {
                                                    const b = bObj.name
                                                    const bIdx = bObj.index
                                                    const zoneMap = getDutiesForSlot(day, b)

                                                    // STRICT ORDERING: Use zonesConfig as master list
                                                    let zonesToRender: string[] = []
                                                    if (zonesConfig.length > 0) {
                                                        // Always show ALL configured zones to allow dropping into empty ones
                                                        zonesToRender = zonesConfig.map(z => z.name)
                                                        // Append orphans just in case
                                                        const orphans = Object.keys(zoneMap).filter(name => !zonesToRender.includes(name))
                                                        zonesToRender = [...zonesToRender, ...orphans]
                                                    } else {
                                                        // Fallback
                                                        zonesToRender = Object.keys(zoneMap).sort()
                                                    }

                                                    return (
                                                        <td key={`${day}-${b}`} className="p-2 align-top border-l bg-gray-50/10">
                                                            <div className="space-y-2">
                                                                {zonesToRender.map(zoneName => {
                                                                    const teachers = zoneMap[zoneName] || []
                                                                    const droppableId = `drop-${day}-${bIdx}-${zoneName}`

                                                                    return (
                                                                        <DroppableZoneArea
                                                                            key={zoneName}
                                                                            id={droppableId}
                                                                            day={day}
                                                                            breakIndex={bIdx}
                                                                            zone={zoneName}
                                                                            onEdit={() => openSlotEditor(day, bIdx, zoneName)}
                                                                        >
                                                                            {teachers.map(tData => {
                                                                                let bg = "bg-green-100 border-green-200 text-green-800"
                                                                                if (tData.assign_status === 'warning') bg = "bg-yellow-100 border-yellow-200 text-yellow-800"
                                                                                if (tData.assign_status === 'critical') bg = "bg-red-100 border-red-200 text-red-800"
                                                                                if (tData.is_pinned) bg = "bg-orange-100 border-orange-200 text-orange-800"

                                                                                const isSelected = selectedTeacher === tData.teacher_code
                                                                                if (isSelected) bg = "bg-blue-600 border-blue-700 text-white"

                                                                                // Identify uniquely: day-break-zone-teacher
                                                                                const draggableId = `drag-${day}-${bIdx}-${zoneName}-${tData.teacher_code}`

                                                                                return (
                                                                                    <DraggableAssignment
                                                                                        key={tData.teacher_code}
                                                                                        id={draggableId}
                                                                                        isPinned={tData.is_pinned}
                                                                                        data={{
                                                                                            day,
                                                                                            breakIndex: bIdx,
                                                                                            zone: zoneName,
                                                                                            teacherCode: tData.teacher_code
                                                                                        }}
                                                                                    >
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                inspectTeacher(tData.teacher_code)
                                                                                            }}
                                                                                            className={`${bg} px-1.5 py-0.5 rounded font-bold text-left w-full flex items-center gap-1 group relative pr-2`}
                                                                                            title={tData.assign_logs?.join(", ")}
                                                                                        >
                                                                                            {tData.is_pinned ? (
                                                                                                <Lock
                                                                                                    className="h-3 w-3 inline text-orange-700 hover:text-red-700 cursor-pointer z-50 relative"
                                                                                                    onClick={(e) => {
                                                                                                        e.preventDefault(); e.stopPropagation();
                                                                                                        togglePin(day, bIdx, zoneName, tData.teacher_code)
                                                                                                    }}
                                                                                                />
                                                                                            ) : (
                                                                                                <Unlock
                                                                                                    className="h-3 w-3 inline opacity-0 group-hover:opacity-40 hover:!opacity-100 cursor-pointer transition-opacity z-50 relative"
                                                                                                    onClick={(e) => {
                                                                                                        e.preventDefault(); e.stopPropagation();
                                                                                                        togglePin(day, bIdx, zoneName, tData.teacher_code)
                                                                                                    }}
                                                                                                />
                                                                                            )}
                                                                                            <span className="truncate">{tData.teacher_code}</span>
                                                                                        </button>
                                                                                    </DraggableAssignment>
                                                                                )
                                                                            })}
                                                                        </DroppableZoneArea>
                                                                    )
                                                                })}
                                                            </div>
                                                        </td>
                                                    )
                                                })}
                                            </tr>
                                        ))
                                    ) : (
                                        // ZONE VIEW (Rows = Zones)
                                        zonesConfig.map(z => (
                                            <tr key={z.name} className="border-b last:border-0 hover:bg-gray-50 transition">
                                                <td className="p-4 border-r font-bold text-gray-800 bg-gray-50/50">
                                                    {z.name}
                                                </td>
                                                {uniqueBreaks.map((bObj: { name: string, index: number }) => {
                                                    const b = bObj.name
                                                    const bIdx = bObj.index
                                                    // Get duties for THIS specific zone/break/activeDay
                                                    const zoneMap = getDutiesForSlot(activeDay, b)
                                                    const teachers = zoneMap[z.name] || []
                                                    const droppableId = `drop-${activeDay}-${bIdx}-${z.name}`

                                                    return (
                                                        <td key={`${z.name}-${b}`} className="p-2 align-top border-l bg-gray-50/10 min-h-[80px]">
                                                            <DroppableZoneArea
                                                                id={droppableId}
                                                                day={activeDay}
                                                                breakIndex={bIdx}
                                                                zone={z.name}
                                                                onEdit={() => openSlotEditor(activeDay, bIdx, z.name)}
                                                            >
                                                                {teachers.map(tData => {
                                                                    let bg = "bg-green-100 border-green-200 text-green-800"
                                                                    if (tData.assign_status === 'warning') bg = "bg-yellow-100 border-yellow-200 text-yellow-800"
                                                                    if (tData.assign_status === 'critical') bg = "bg-red-100 border-red-200 text-red-800"
                                                                    if (tData.is_pinned) bg = "bg-orange-100 border-orange-200 text-orange-800"

                                                                    const isSelected = selectedTeacher === tData.teacher_code
                                                                    if (isSelected) bg = "bg-blue-600 border-blue-700 text-white"

                                                                    const draggableId = `drag-${activeDay}-${bIdx}-${z.name}-${tData.teacher_code}`

                                                                    return (
                                                                        <DraggableAssignment
                                                                            key={tData.teacher_code}
                                                                            id={draggableId}
                                                                            isPinned={tData.is_pinned}
                                                                            data={{
                                                                                day: activeDay,
                                                                                breakIndex: bIdx,
                                                                                zone: z.name,
                                                                                teacherCode: tData.teacher_code
                                                                            }}
                                                                        >
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    inspectTeacher(tData.teacher_code)
                                                                                }}
                                                                                className={`${bg} px-1.5 py-0.5 rounded font-bold text-left w-full flex items-center gap-1 group relative pr-2`}
                                                                                title={tData.assign_logs?.join(", ")}
                                                                            >
                                                                                {tData.is_pinned ? (
                                                                                    <Lock
                                                                                        className="h-3 w-3 inline text-orange-700 hover:text-red-700 cursor-pointer z-50 relative"
                                                                                        onClick={(e) => {
                                                                                            e.preventDefault(); e.stopPropagation();
                                                                                            togglePin(activeDay, bIdx, z.name, tData.teacher_code)
                                                                                        }}
                                                                                    />
                                                                                ) : (
                                                                                    <Unlock
                                                                                        className="h-3 w-3 inline opacity-0 group-hover:opacity-40 hover:!opacity-100 cursor-pointer transition-opacity z-50 relative"
                                                                                        onClick={(e) => {
                                                                                            e.preventDefault(); e.stopPropagation();
                                                                                            togglePin(activeDay, bIdx, z.name, tData.teacher_code)
                                                                                        }}
                                                                                    />
                                                                                )}
                                                                                <span className="truncate">{tData.teacher_code}</span>
                                                                            </button>
                                                                        </DraggableAssignment>
                                                                    )
                                                                })}
                                                            </DroppableZoneArea>
                                                        </td>
                                                    )
                                                })}
                                            </tr>
                                        ))
                                    )}
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
        </DndContext >
    )
}

// --- DnD Components ---
// import {useDraggable, useDroppable} from '@dnd-kit/core' (Moved to top)

function DraggableAssignment({ id, data, children, isPinned }: { id: string, data: DraggableData, children: React.ReactNode, isPinned?: boolean }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: id,
        data: data, // Pass rich data
        disabled: isPinned,
    })

    const style: React.CSSProperties | undefined = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 999,
        position: 'relative',
    } : undefined

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes}
            className={`inline-block p-1 m-0.5 rounded border shadow-sm text-xs cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-50' : ''} ${isPinned ? 'border-orange-300 bg-orange-50 cursor-not-allowed' : 'bg-white hover:border-blue-300'}`}>
            {children}
        </div>
    )
}

function DroppableZoneArea({ id, day, breakIndex, zone, children, onEdit }: { id: string, day: string, breakIndex: number, zone: string, children: React.ReactNode, onEdit: () => void }) {
    const { isOver, setNodeRef } = useDroppable({
        id: id,
        data: { day, breakIndex, zone }
    })

    return (
        <div ref={setNodeRef} className={`text-xs border rounded p-1.5 transition-colors relative group/zone ${isOver ? 'bg-blue-100 ring-2 ring-blue-400 border-blue-400' : 'bg-blue-50/50 border-blue-100 hover:border-blue-300'}`}>
            <div className="font-semibold text-blue-800 mb-0.5 flex justify-between items-center h-4">
                <span>{zone}</span>
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onEdit()
                    }}
                    className="opacity-0 group-hover/zone:opacity-100 hover:bg-blue-200 p-0.5 rounded text-blue-700 transition-all font-normal text-[10px]"
                    title="Edytuj dyżur (Dodaj/Usuń)"
                >
                    Edytuj
                </button>
            </div>
            <div
                className="flex flex-wrap gap-1 min-h-[24px] cursor-pointer"
                onClick={(e) => {
                    if (e.target === e.currentTarget) onEdit()
                }}
            >
                {children}
            </div>
        </div>
    )
}
