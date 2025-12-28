import React, { useState, useEffect } from 'react'
import { cn } from '../lib/utils'
import { Save, Lock } from 'lucide-react'

export interface LessonSlot {
    day: string
    lesson_index: number
    group_code: string | null
    room_code: string | null
    subject: string | null
    is_empty: boolean
}

export interface ManualDuty {
    day: string
    break_index: number
    zone_id: string
}

export interface TeacherSchedule {
    teacher_code: string
    teacher_name: string
    schedule: LessonSlot[]
    manual_duties?: ManualDuty[]
    duties?: any[] // Computed duties from solver response
    preferences?: { preferred_zones?: string[] }
}

interface ScheduleGridProps {
    data: TeacherSchedule
    onSave: (updated: TeacherSchedule) => void
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const LESSONS = Array.from({ length: 9 }, (_, i) => i + 1) // 1-9

export function ScheduleGrid({ data, onSave }: ScheduleGridProps) {
    const [schedule, setSchedule] = useState<LessonSlot[]>(data.schedule)

    // Initialize manualDuties by merging existing pinned duties with computed duties
    // This allows the user to see (and edit) what the solver assigned.
    const [manualDuties, setManualDuties] = useState<ManualDuty[]>(() => {
        const manual = data.manual_duties || []
        const computed = data.duties || []

        // Convert computed to ManualDuty format
        const computedMapped: ManualDuty[] = computed.map((d: any) => ({
            day: d.day,
            break_index: d.break_index,
            zone_id: d.zone_id
        }))

        // Merge: Manual takes precedence. If computed exists for a slot that manual doesn't cover, add it.
        const merged = [...manual]
        const manualKeys = new Set(manual.map(m => `${m.day}-${m.break_index}`))

        for (const c of computedMapped) {
            const key = `${c.day}-${c.break_index}`
            if (!manualKeys.has(key)) {
                merged.push(c)
            }
        }

        return merged
    })

    const [teacherCode, setTeacherCode] = useState(data.teacher_code)

    const [zones, setZones] = useState<{ id: string, name: string }[]>([])

    // Fetch zones on mount
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                // Fetch duty config to get zones
                const res = await fetch('http://127.0.0.1:8765/api/config/duty_rules')
                if (res.ok) {
                    const json = await res.json()
                    // Response format: { key: "duty_rules", value: { zones: [...], ... } }
                    if (json.value && json.value.zones) {
                        setZones(json.value.zones)
                    }
                }
            } catch (e) {
                console.error("Failed to fetch zones", e)
            }
        }
        fetchConfig()
    }, [])

    // Update local state when data prop changes (e.g. after save/refresh)
    useEffect(() => {
        setSchedule(data.schedule)

        // Re-run merge logic on data update
        const manual = data.manual_duties || []
        const computed = data.duties || []
        const computedMapped: ManualDuty[] = computed.map((d: any) => ({
            day: d.day,
            break_index: d.break_index,
            zone_id: d.zone_id
        }))
        const merged = [...manual]
        const manualKeys = new Set(manual.map(m => `${m.day}-${m.break_index}`))
        for (const c of computedMapped) {
            if (!manualKeys.has(`${c.day}-${c.break_index}`)) {
                merged.push(c)
            }
        }
        setManualDuties(merged)

        setTeacherCode(data.teacher_code)
    }, [data])

    // Helper to find slot
    const getSlot = (day: string, index: number) =>
        schedule.find(s => s.day === day && s.lesson_index === index)

    const handleCellChange = (day: string, index: number, field: keyof LessonSlot, value: string) => {
        setSchedule(prev => {
            const existing = prev.find(s => s.day === day && s.lesson_index === index)
            if (existing) {
                return prev.map(s => (s.day === day && s.lesson_index === index) ? { ...s, [field]: value } : s)
            } else {
                // Create new slot if it didn't exist (e.g. adding a lesson to empty spot)
                return [...prev, {
                    day,
                    lesson_index: index,
                    group_code: field === 'group_code' ? value : null,
                    room_code: field === 'room_code' ? value : null,
                    subject: field === 'subject' ? value : null,
                    is_empty: false
                } as LessonSlot]
            }
        })
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-gray-500 font-medium">Teacher Code:</span>
                    <input
                        type="text"
                        value={teacherCode}
                        onChange={(e) => setTeacherCode(e.target.value)}
                        className="font-bold text-gray-900 bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none px-1"
                    />
                </div>
                <button
                    onClick={() => onSave({
                        ...data,
                        teacher_code: teacherCode,
                        teacher_name: teacherCode,
                        schedule,
                        manual_duties: manualDuties
                    })}
                    className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 shadow-sm transition"
                >
                    Save & Verify
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                        <tr>
                            <th className="px-3 py-2 w-10 text-center">#</th>
                            {DAYS.map(day => (
                                <th key={day} className="px-3 py-2 border-l min-w-[140px]">{day}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {LESSONS.map(lessonIndex => (
                            <React.Fragment key={lessonIndex}>
                                <tr className="border-b last:border-0 hover:bg-gray-50">
                                    <td className="px-3 py-2 font-medium text-center text-gray-500 bg-gray-50 border-r">
                                        {lessonIndex}
                                    </td>
                                    {DAYS.map(day => {
                                        const slot = getSlot(day, lessonIndex)
                                        return (
                                            <td key={`${day}-${lessonIndex}`} className="px-2 py-2 border-l relative group">
                                                <div className="flex flex-col gap-1">
                                                    <input
                                                        placeholder="Class"
                                                        className="w-full text-xs font-bold text-blue-700 placeholder-gray-300 outline-none bg-transparent focus:bg-white"
                                                        value={slot?.group_code || ''}
                                                        onChange={e => handleCellChange(day, lessonIndex, 'group_code', e.target.value)}
                                                    />
                                                    <div className="flex gap-1">
                                                        <input
                                                            placeholder="Room"
                                                            className="w-1/2 text-[10px] text-gray-500 placeholder-gray-200 outline-none bg-transparent focus:bg-white"
                                                            value={slot?.room_code || ''}
                                                            onChange={e => handleCellChange(day, lessonIndex, 'room_code', e.target.value)}
                                                        />
                                                        <input
                                                            placeholder="Subj"
                                                            className="w-1/2 text-[10px] text-gray-400 placeholder-gray-200 outline-none bg-transparent focus:bg-white text-right"
                                                            value={slot?.subject || ''}
                                                            onChange={e => handleCellChange(day, lessonIndex, 'subject', e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                        )
                                    })}
                                </tr>
                                {/* Break Row (After Lesson X) */}
                                {lessonIndex < 9 && (
                                    <tr className="bg-orange-50/30 h-8 border-b border-orange-100">
                                        <td className="px-1 text-[9px] text-center text-orange-400 font-bold bg-orange-50 border-r">
                                            PO {lessonIndex}
                                        </td>
                                        {DAYS.map(day => {
                                            const duty = manualDuties.find(d => d.day === day && d.break_index === lessonIndex)
                                            return (
                                                <td key={`break-${day}-${lessonIndex}`} className="px-1 border-l text-center relative hover:bg-orange-100 transition-colors group/break">
                                                    {duty ? (
                                                        <div className="inline-flex items-center gap-1 bg-orange-100 px-2 py-0.5 rounded text-[10px] text-orange-700 border border-orange-200 cursor-pointer hover:bg-red-100 hover:text-red-700 hover:border-red-300"
                                                            title="Kliknij, aby usunąć (Trwale przypięty dla Solvera)"
                                                            onClick={() => setManualDuties(prev => prev.filter(d => d !== duty))}
                                                        >
                                                            <div className="w-3 h-3"><Lock size={10} /></div>
                                                            <span className="font-bold">
                                                                {zones.find(z => String(z.id) == String(duty.zone_id))?.name || duty.zone_id || "?"}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <select
                                                            className="w-full h-full bg-transparent text-[9px] text-gray-400 outline-none opacity-0 group-hover/break:opacity-100 cursor-pointer text-center appearance-none position-absolute inset-0"
                                                            onChange={(e) => {
                                                                const val = e.target.value
                                                                if (val) {
                                                                    setManualDuties(prev => [...prev, {
                                                                        day,
                                                                        break_index: lessonIndex,
                                                                        zone_id: val
                                                                    }])
                                                                    e.target.value = "" // Reset select
                                                                }
                                                            }}
                                                        >
                                                            <option value="">+ Dodaj ({zones.length})</option>
                                                            {zones.map(z => (
                                                                <option key={z.id} value={z.id}>{z.name}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </td>
                                            )
                                        })}
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
