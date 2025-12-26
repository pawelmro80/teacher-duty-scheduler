import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Trash2, Users, Search, AlertTriangle } from 'lucide-react'

// Basic Teacher Interface based on previous context
interface Teacher {
    id: string;
    teacher_code: string;
    name: string;
    schedule_json?: any[];
}

interface TeachersListProps {
    onSelect?: (teacherCode: string) => void
    refreshTrigger?: number
}

export function TeachersList({ onSelect, refreshTrigger }: TeachersListProps) {
    const [teachers, setTeachers] = useState<Teacher[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [filter, setFilter] = useState('')

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
        <div className="p-8 max-w-6xl mx-auto h-full flex flex-col">
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
                                <th className="p-4 border-b text-right">Akcje</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={3} className="p-8 text-center text-gray-400">Ładowanie...</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={3} className="p-8 text-center text-gray-400">Brak nauczycieli w bazie.</td></tr>
                            ) : (
                                filtered.map(t => (
                                    <tr key={t.teacher_code} className="hover:bg-gray-50 transition-colors">
                                        <td className="p-4 font-medium text-gray-900">{t.teacher_code}</td>
                                        <td className="p-4 text-gray-500">
                                            {/* Assuming schedule_json is attached, calculating length */}
                                            {t.schedule_json ? t.schedule_json.length : 0}
                                        </td>
                                        <td className="p-4 text-right">
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
        </div>
    )
}
