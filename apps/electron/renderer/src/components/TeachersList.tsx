import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Trash2, Users, Search, AlertTriangle, Pencil, Eye, X, Download, Save, ArrowLeft } from 'lucide-react'
import { ScheduleGrid, TeacherSchedule } from './ScheduleGrid'

// Basic Teacher Interface based on previous context
interface Teacher {
    id: string;
    teacher_code: string;
    name: string;
    schedule_json?: any[];
    slots_count?: number;
    target_duties?: number;
    actual_duties?: number;
    preferences?: {
        preferred_zones?: string[];
    }
}

interface TeachersListProps {
    onSelect?: (teacherCode: string) => void
    refreshTrigger?: number
}

interface SchedulePreviewModalProps {
    teacherCode: string
    zones: any[]
    onClose: () => void
}

function SchedulePreviewModal({ teacherCode, zones, onClose }: SchedulePreviewModalProps) {
    const [data, setData] = useState<TeacherSchedule | null>(null)
    const [loading, setLoading] = useState(true)
    const [isEditing, setIsEditing] = useState(false)

    const fetchData = () => {
        setLoading(true)
        axios.get(`http://127.0.0.1:8765/api/schedule/${teacherCode}`)
            .then(res => setData(res.data))
            .catch(e => alert("Błąd pobierania planu"))
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        fetchData()
    }, [teacherCode])

    const handleSave = async (updated: TeacherSchedule) => {
        try {
            await axios.post('http://127.0.0.1:8765/api/schedule/save', updated)
            setData(updated)
            setIsEditing(false)
            alert("Plan zapisany pomyślnie!")
        } catch (e) {
            console.error(e)
            alert("Błąd zapisu planu")
        }
    }

    if (!data && loading) return <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50"><div className="bg-white p-8 rounded-xl">Ładowanie...</div></div>
    if (!data) return null

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    const dayLabels: any = { Mon: 'Pon', Tue: 'Wt', Wed: 'Śr', Thu: 'Czw', Fri: 'Pt' }

    // Helper to find lesson
    const getLesson = (day: string, idx: number) => {
        return data.schedule?.find((s: any) => s.day === day && (String(s.lesson_index) === String(idx)))
    }

    // Helper to find duty - FIX: manual_duties vs computed duties
    // The previous view used 'duties' which came from /schedule/{code} which includes computed duties.
    // The ScheduleGrid uses 'manual_duties'.
    // For Read-Only view, we prefer showing ALL duties (computed + manual).
    // The API /schedule/{code} returns `duties` (list of DutyAssignment).
    // Let's assume `data` has `duties` property from the API response for the read-only view.
    // Helper to find duty - Prioritize Manual over Computed
    const duties = (data as any).duties || []
    const manual_duties = (data as any).manual_duties || []

    const getDuty = (day: string, afterLesson: number) => {
        // 1. Check Manual
        const manual = manual_duties.find((d: any) => d.day === day && String(d.break_index) === String(afterLesson))

        if (manual) {
            return {
                ...manual,
                zone_name: zones.find(z => String(z.id) == String(manual.zone_id))?.name || manual.zone_id,
                break_name: `Po ${afterLesson}.`,
                assign_status: 'manual' // Custom status for coloring
            }
        }

        // 2. Check Computed
        return duties.find((d: any) => d.day === day && String(d.break_index) === String(afterLesson))
    }

    return (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 p-8">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <div>
                        <h2 className="text-2xl font-bold flex items-center gap-3 text-gray-800">
                            <span className="bg-blue-600 text-white px-3 py-1 rounded-lg text-lg shadow-sm font-mono">{data.teacher_code}</span>
                            {data.teacher_name}
                        </h2>
                        <p className="text-gray-500 text-sm mt-1 ml-1 flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${isEditing ? 'bg-orange-500' : 'bg-green-500'}`}></span>
                            {isEditing ? 'Tryb Edycji' : 'Plan Lekcji + Przypisane Dyżury'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {!isEditing && (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium shadow-sm"
                            >
                                <Pencil className="h-4 w-4" />
                                Edytuj Plan
                            </button>
                        )}

                        {isEditing && (
                            <button
                                onClick={() => setIsEditing(false)}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Anuluj
                            </button>
                        )}

                        {!isEditing && (
                            <button
                                onClick={() => window.open(`http://127.0.0.1:8765/api/schedule/${teacherCode}/pdf`, '_blank')}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
                            >
                                <Download className="h-4 w-4" />
                                Pobierz PDF
                            </button>
                        )}

                        <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors ml-2">
                            <X className="h-6 w-6 text-gray-500" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-6 bg-white">
                    {isEditing ? (
                        <div className="max-w-4xl mx-auto">
                            <ScheduleGrid data={data} onSave={handleSave} />
                        </div>
                    ) : (
                        <table className="w-full border-collapse text-sm shadow-sm rounded-lg overflow-hidden ring-1 ring-gray-200">

                            <thead>
                                <tr>
                                    <th className="p-3 border bg-gray-100/50 w-12 text-center text-gray-400 font-medium">#</th>
                                    {days.map(d => (
                                        <th key={d} className="p-4 border bg-gray-100/50 font-bold text-gray-700 w-1/5 text-left uppercase text-xs tracking-wider">
                                            {dayLabels[d]}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {Array.from({ length: 9 }).map((_, idx) => {
                                    const i = idx + 1 // Start from 1
                                    return (
                                        <React.Fragment key={i}>
                                            {/* LESSON ROW */}
                                            <tr className="h-14 hover:bg-gray-50/30 transition-colors">
                                                <td className="border border-gray-100 bg-gray-50/30 font-mono text-center text-gray-400 font-bold text-lg">{i}</td>
                                                {days.map(d => {
                                                    const l = getLesson(d, i)
                                                    return (
                                                        <td key={d} className={`border border-gray-100 p-2 align-top ${l ? 'bg-white' : 'bg-gray-50/20'}`}>
                                                            {l ? (
                                                                <div className="flex flex-col h-full justify-center">
                                                                    <span className="font-bold text-gray-800 text-base">
                                                                        {l.group_code && <span className="text-blue-600 mr-1">{l.group_code}</span>}
                                                                        {l.subject}
                                                                    </span>
                                                                    <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded w-fit border border-gray-200 font-mono">{l.room_code || 'S?'}</span>
                                                                </div>
                                                            ) : null}
                                                        </td>
                                                    )
                                                })}
                                            </tr>
                                            {/* DUTY ROW (After Lesson i) */}
                                            {i < 9 && (
                                                <tr className="h-2">
                                                    <td className="border-r border-gray-100 bg-gray-50/30"></td>
                                                    {days.map(d => {
                                                        const duty = getDuty(d, i) // Duty after lesson i

                                                        if (!duty) return <td key={d} className="border-r border-b border-gray-100 bg-gray-50/10"></td>

                                                        let color = "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                                                        if (duty.assign_status === 'warning') color = "bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100"
                                                        if (duty.assign_status === 'critical') color = "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                                                        if (duty.assign_status === 'manual') color = "bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200 ring-1 ring-orange-300"

                                                        return (
                                                            <td key={d} className="border-r border-b border-gray-100 p-0 relative h-8">
                                                                <div className={`absolute inset-x-1 top-0 bottom-0 my-0.5 rounded flex items-center justify-center text-xs font-bold border ${color} shadow-sm transition-all cursor-help`} title={duty.break_name}>
                                                                    {duty.zone_name}
                                                                </div>
                                                            </td>
                                                        )
                                                    })}
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    )
}

export function TeachersList({ onSelect, refreshTrigger }: TeachersListProps) {
    const [teachers, setTeachers] = useState<Teacher[]>([])
    const [previewTeacherCode, setPreviewTeacherCode] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [filter, setFilter] = useState('')

    const [zones, setZones] = useState<any[]>([])
    const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null)
    const [saving, setSaving] = useState(false)

    // Load Zones (for preference selector)
    useEffect(() => {
        axios.get('http://127.0.0.1:8765/api/config/duty_rules')
            .then(res => {
                if (res.data.value && res.data.value.zones) {
                    setZones(res.data.value.zones)
                }
            })
            .catch(e => console.error("Failed to load zones", e))
    }, [])

    const handleSaveTeacher = async () => {
        if (!editingTeacher) return
        setSaving(true)
        try {
            await axios.post('http://127.0.0.1:8765/api/schedule/save', {
                ...editingTeacher,
                schedule: editingTeacher.schedule_json || []
            })
            setTeachers(prev => prev.map(t => t.teacher_code === editingTeacher.teacher_code ? editingTeacher : t))
            setEditingTeacher(null)
        } catch (e: any) {
            alert("Błąd zapisu: " + e.message)
        } finally {
            setSaving(false)
        }
    }

    // Helper to toggle a zone in preferences
    const toggleZonePref = (zoneId: string) => {
        if (!editingTeacher) return
        const current = editingTeacher.preferences?.preferred_zones || []
        const exists = current.includes(zoneId)
        let next = exists ? current.filter(id => id !== zoneId) : [...current, zoneId]

        setEditingTeacher({
            ...editingTeacher,
            preferences: { ...editingTeacher.preferences, preferred_zones: next }
        })
    }

    const fetchTeachers = async () => {
        setLoading(true)
        try {
            // Corrected endpoint from / to /list
            const res = await axios.get('http://127.0.0.1:8765/api/schedule/list')
            setTeachers(res.data)
            setError(null)
        } catch (e: any) {
            setError("Nie udało się pobrać listy nauczycieli. Upewnij się, że backend działa.")
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const deleteTeacher = async (code: string) => {
        if (!confirm(`Czy na pewno usunąć nauczyciela ${code}?`)) return

        try {
            await axios.delete(`http://127.0.0.1:8765/api/schedule/${code}`)
            setTeachers(prev => prev.filter(t => t.teacher_code !== code))
        } catch (e) {
            alert("Błąd podczas usuwania.")
        }
    }

    useEffect(() => {
        fetchTeachers()
    }, [refreshTrigger])

    const filtered = teachers.filter(t => t.teacher_code.toLowerCase().includes(filter.toLowerCase()))



    return (
        <div className="p-8 max-w-6xl mx-auto h-full flex flex-col relative">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-800">
                    <Users className="text-blue-600" />
                    Baza Nauczycieli
                    <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full ml-2">
                        {teachers.length}
                    </span>
                </h1>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Szukaj..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="pl-9 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none w-64"
                    />
                </div>
            </div>

            {error && (
                <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6 border border-red-200 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    {error}
                </div>
            )}

            <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                <div className="overflow-auto flex-1">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-semibold sticky top-0">
                            <tr>
                                <th className="p-4 border-b">Kod Nauczyciela</th>
                                <th className="p-4 border-b">Liczba Lekcji</th>
                                <th className="p-4 border-b">Ulubione Strefy</th>
                                <th className="p-4 border-b">Cel (Dyżury)</th>
                                <th className="p-4 border-b">Aktualnie (Dyżury)</th>
                                <th className="p-4 border-b text-right">Akcje</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-400">Ładowanie...</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-400">Brak nauczycieli w bazie.</td></tr>
                            ) : (
                                filtered.map(t => (
                                    <tr key={t.teacher_code} className="hover:bg-gray-50 transition-colors">
                                        <td className="p-4 font-medium text-gray-900">{t.teacher_code}</td>
                                        <td className="p-4 text-gray-500">
                                            {t.slots_count !== undefined ? t.slots_count : (t.schedule_json ? t.schedule_json.length : 0)}
                                        </td>
                                        <td className="p-4 text-gray-500 text-sm">
                                            {t.preferences?.preferred_zones?.length ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {t.preferences.preferred_zones.map(zid => {
                                                        const z = zones.find(z => z.id === zid)
                                                        return (
                                                            <span key={zid} className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-xs border border-yellow-200">
                                                                {z ? z.name : zid}
                                                            </span>
                                                        )
                                                    })}
                                                </div>
                                            ) : <span className="text-gray-300">-</span>}
                                        </td>
                                        <td className="p-4 text-gray-500 font-medium">
                                            {t.target_duties ?? '-'}
                                        </td>
                                        <td className={`p-4 font-bold ${(t.actual_duties || 0) < (t.target_duties || 0) ? 'text-blue-600' :
                                            (t.actual_duties || 0) > (t.target_duties || 0) + 2 ? 'text-red-500' : 'text-green-600'
                                            }`}>
                                            {t.actual_duties ?? 0}
                                        </td>
                                        <td className="p-4 text-right flex justify-end gap-2">
                                            <button
                                                onClick={() => setPreviewTeacherCode(t.teacher_code)}
                                                className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors border border-transparent hover:border-blue-200"
                                                title="Podgląd Planu"
                                            >
                                                <Eye className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => setEditingTeacher(t)}
                                                className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="Edytuj"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => deleteTeacher(t.teacher_code)}
                                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Usuń"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* EDIT MODAL */}
            {editingTeacher && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 rounded-xl">
                    <div className="bg-white p-6 rounded-xl shadow-2xl w-96 border border-gray-200">
                        <h2 className="text-xl font-bold mb-4">Edytuj Nauczyciela</h2>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Kod</label>
                            <input
                                disabled
                                value={editingTeacher.teacher_code}
                                className="w-full p-2 bg-gray-100 rounded border border-gray-300 text-gray-500"
                            />
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Preferowane Strefy</label>
                            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 space-y-1">
                                {zones.map(z => {
                                    const isSelected = editingTeacher.preferences?.preferred_zones?.includes(z.id)
                                    return (
                                        <div
                                            key={z.id}
                                            onClick={() => toggleZonePref(z.id)}
                                            className={`p-2 rounded cursor-pointer text-sm flex items-center gap-2 ${isSelected ? 'bg-blue-50 text-blue-800 border-blue-200 border' : 'hover:bg-gray-50'}`}
                                        >
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-400'}`}>
                                                {isSelected && <span className="text-white text-xs">✓</span>}
                                            </div>
                                            {z.name}
                                        </div>
                                    )
                                })}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Nauczyciel będzie priorytetowo obsadzany w tych strefach.</p>
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <button
                                onClick={() => setEditingTeacher(null)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                            >
                                Anuluj
                            </button>
                            <button
                                onClick={handleSaveTeacher}
                                disabled={saving}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
                            >
                                {saving ? 'Zapisywanie...' : 'Zapisz'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {previewTeacherCode && (
                <SchedulePreviewModal
                    teacherCode={previewTeacherCode}
                    zones={zones}
                    onClose={() => setPreviewTeacherCode(null)}
                />
            )}
        </div>
    )
}
