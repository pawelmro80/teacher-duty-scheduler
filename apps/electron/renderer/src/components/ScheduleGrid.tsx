import { useState, useEffect } from 'react'
import { cn } from '../lib/utils'

export interface LessonSlot {
    day: string
    lesson_index: number
    group_code: string | null
    room_code: string | null
    subject: string | null
    is_empty: boolean
}

export interface TeacherSchedule {
    teacher_code: string
    teacher_name: string
    schedule: LessonSlot[]
}

interface ScheduleGridProps {
    data: TeacherSchedule
    onSave: (updated: TeacherSchedule) => void
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const LESSONS = Array.from({ length: 9 }, (_, i) => i + 1) // 1-9

export function ScheduleGrid({ data, onSave }: ScheduleGridProps) {
    const [schedule, setSchedule] = useState<LessonSlot[]>(data.schedule)
    const [teacherCode, setTeacherCode] = useState(data.teacher_code)

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
                    onClick={() => onSave({ ...data, teacher_code: teacherCode, teacher_name: teacherCode, schedule })}
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
                            <tr key={lessonIndex} className="border-b last:border-0 hover:bg-gray-50">
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
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
