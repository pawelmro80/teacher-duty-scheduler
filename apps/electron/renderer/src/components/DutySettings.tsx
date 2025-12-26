import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Plus, Trash2, Save, Settings, MapPin, Clock, Sliders } from 'lucide-react'

// Types for our configuration
interface DutyZone {
    id: string
    name: string
}

interface DutyBreak {
    id: string
    name: string
    afterLesson: number // 1 means break is after lesson 1
    duration: number
}

interface DutyRequirements {
    // Map: zoneId -> breakId -> number of teachers needed
    [zoneId: string]: {
        [breakId: string]: number
    }
}

interface DutyRules {
    max_duties_per_day: number
    max_long_break_duties: number
}

interface ConfigPayload {
    zones: DutyZone[]
    breaks: DutyBreak[]
    requirements: DutyRequirements
    rules?: DutyRules
}

export function DutySettings() {
    const [zones, setZones] = useState<DutyZone[]>([
        { id: 'z1', name: 'Parter (Korytarz)' },
        { id: 'z2', name: 'Stołówka' },
        { id: 'z3', name: 'Boisko' }
    ])

    const [breaks, setBreaks] = useState<DutyBreak[]>([
        { id: 'b1', name: 'Po 1. lekcji (10min)', afterLesson: 1, duration: 10 },
        { id: 'b2', name: 'Po 2. lekcji (10min)', afterLesson: 2, duration: 10 },
        { id: 'b3', name: 'Duża Przerwa (20min)', afterLesson: 3, duration: 20 },
        { id: 'b4', name: 'Obiad (20min)', afterLesson: 4, duration: 20 }
    ])

    const [requirements, setRequirements] = useState<DutyRequirements>({})
    const [rules, setRules] = useState<DutyRules>({ max_duties_per_day: 2, max_long_break_duties: 3 })
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    // Load initial config
    useEffect(() => {
        const load = async () => {
            try {
                const res = await axios.get('http://127.0.0.1:8765/api/config/duty_rules')
                if (res.data.value) {
                    const cfg = res.data.value as ConfigPayload
                    setZones(cfg.zones || [])
                    setBreaks(cfg.breaks || [])
                    setRequirements(cfg.requirements || {})
                    if (cfg.rules) setRules(cfg.rules)
                }
            } catch (e) {
                console.error("Failed to load config", e)
            }
        }
        load()
    }, [])

    const handleSave = async () => {
        setSaving(true)
        const payload: ConfigPayload = { zones, breaks, requirements, rules }
        try {
            await axios.post('http://127.0.0.1:8765/api/config/save', {
                key: 'duty_rules',
                value: payload
            })
            alert('Ustawienia zapisane! Solver użyje tych reguł. 💾')
        } catch (e: any) {
            alert('Błąd zapisu: ' + e.message)
        } finally {
            setSaving(false)
        }
    }

    const updateRequirement = (zoneId: string, breakId: string, val: string) => {
        const num = parseInt(val) || 0
        setRequirements(prev => ({
            ...prev,
            [zoneId]: {
                ...(prev[zoneId] || {}),
                [breakId]: num
            }
        }))
    }

    // Zone Handlers
    const addZone = () => {
        setZones([...zones, { id: `z${Date.now()}`, name: 'Nowa Strefa' }])
    }
    const removeZone = (idx: number) => {
        const newZones = [...zones]
        newZones.splice(idx, 1)
        setZones(newZones)
    }
    const updateZone = (idx: number, name: string) => {
        const newZones = [...zones]
        newZones[idx].name = name
        setZones(newZones)
    }

    // Break Handlers
    const addBreak = () => {
        const lastLesson = breaks.length > 0 ? breaks[breaks.length - 1].afterLesson : 0
        setBreaks([...breaks, {
            id: `b${Date.now()}`,
            name: `Po ${lastLesson + 1}. lekcji`,
            afterLesson: lastLesson + 1,
            duration: 10
        }])
    }
    const removeBreak = (idx: number) => {
        const newBreaks = [...breaks]
        newBreaks.splice(idx, 1)
        setBreaks(newBreaks)
    }
    const updateBreak = (idx: number, field: keyof DutyBreak, value: any) => {
        const newBreaks = [...breaks]
        // @ts-ignore
        newBreaks[idx][field] = value
        setBreaks(newBreaks)
    }

    // Check for duplicates
    const timeCounts = breaks.reduce((acc, b) => {
        acc[b.afterLesson] = (acc[b.afterLesson] || 0) + 1
        return acc
    }, {} as Record<number, number>)

    const hasDuplicates = Object.values(timeCounts).some(c => c > 1)

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-900">
                    <Settings className="text-blue-600" />
                    Ustawienia Dyżurów
                </h1>

                {hasDuplicates && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2 animate-pulse">
                        <span className="font-bold">⚠️ Uwaga:</span>
                        Wykryto przerwy o tym samym czasie ("Po Lekcji Nr"). To spowoduje błędy!
                    </div>
                )}
            </div>

            <div className="space-y-6">

                {/* --- SEKCJA STREF (ZONES) --- */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <MapPin className="text-gray-500" />
                        Strefy Dyżurów
                    </h2>
                    <p className="text-sm text-gray-500 mb-4">Zdefiniuj strefy, w których nauczyciele będą pełnić dyżury (np. Korytarz I Piętro, Stołówka).</p>

                    <div className="space-y-3">
                        {zones.map((z, idx) => (
                            <div key={idx} className="flex gap-2">
                                <input
                                    value={z.name}
                                    onChange={(e) => updateZone(idx, e.target.value)}
                                    placeholder="Nazwa strefy (np. Korytarz)"
                                    className="flex-1 p-2 border rounded-lg focus:ring-2 focus:ring-blue-200 outline-none"
                                />
                                <button onClick={() => removeZone(idx)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                                    <Trash2 className="h-5 w-5" />
                                </button>
                            </div>
                        ))}
                        <button onClick={addZone} className="text-blue-600 font-medium text-sm hover:underline flex items-center gap-1">
                            <Plus className="h-4 w-4" /> Dodaj nową strefę
                        </button>
                    </div>
                </div>

                {/* --- SEKCJA PRZERW (BREAKS) --- */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <Clock className="text-gray-500" />
                        Przerwy i Czas trwania
                    </h2>
                    <p className="text-sm text-gray-500 mb-4">Określ, po której lekcji odbywają się dyżury.</p>

                    <div className="space-y-3">
                        {breaks.map((b, idx) => {
                            const isDup = timeCounts[b.afterLesson] > 1
                            return (
                                <div key={idx} className={`flex gap-2 items-center p-3 rounded-lg transition ${isDup ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
                                    <span className="text-gray-500 font-mono text-sm w-8 text-center">{idx + 1}.</span>
                                    <div className="flex-1 grid grid-cols-2 gap-4">
                                        <div>
                                            <label className={`text-xs font-bold uppercase block mb-1 ${isDup ? 'text-red-500' : 'text-gray-500'}`}>
                                                {isDup ? '⚠️ DUPLIKAT' : 'Po Lekcji Nr'}
                                            </label>
                                            <input
                                                type="number"
                                                value={b.afterLesson}
                                                onChange={(e) => updateBreak(idx, 'afterLesson', parseInt(e.target.value))}
                                                className={`w-full p-2 border rounded ${isDup ? 'border-red-300 bg-red-50' : ''}`}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500 font-bold uppercase block mb-1">Czas (min)</label>
                                            <input
                                                type="number"
                                                value={b.duration}
                                                onChange={(e) => updateBreak(idx, 'duration', parseInt(e.target.value))}
                                                className="w-full p-2 border rounded"
                                            />
                                        </div>
                                    </div>
                                    <button onClick={() => removeBreak(idx)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                                        <Trash2 className="h-5 w-5" />
                                    </button>
                                </div>
                            )
                        })}
                        <button onClick={addBreak} className="text-blue-600 font-medium text-sm hover:underline flex items-center gap-1">
                            <Plus className="h-4 w-4" /> Dodaj przerwę
                        </button>
                    </div>
                </div>

                {/* --- SEKCJA REGUŁ (RULES) --- */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <Sliders className="text-gray-500" />
                        Reguły i Ograniczenia
                    </h2>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                            <div>
                                <div className="font-bold text-gray-800">Maks. dyżurów dziennie</div>
                                <div className="text-xs text-gray-500">Ile maksymalnie dyżurów jeden nauczyciel może mieć w ciągu dnia.</div>
                            </div>
                            <input
                                type="number"
                                value={rules.max_duties_per_day}
                                onChange={(e) => setRules({ ...rules, max_duties_per_day: parseInt(e.target.value) })}
                                className="w-20 p-2 border rounded-lg text-center font-bold"
                            />
                        </div>

                        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                            <div>
                                <div className="font-bold text-gray-800">Maks. dyżurów w trakcie "Długiej Przerwy" (na tydzień)</div>
                                <div className="text-xs text-gray-500">Ile razy w tygodniu jeden nauczyciel może mieć dyżur na długiej przerwie (np. max 2 obiady/tydzień).</div>
                            </div>
                            <input
                                type="number"
                                value={rules.max_long_break_duties}
                                onChange={(e) => setRules({ ...rules, max_long_break_duties: parseInt(e.target.value) })}
                                className="w-20 p-2 border rounded-lg text-center font-bold"
                            />
                        </div>
                    </div>
                </div>

                {/* --- MATRIX WYMAGAŃ (REQUIREMENTS) --- */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <Settings className="text-gray-500" />
                        Wymagana Liczba Nauczycieli
                    </h2>
                    <table className="w-full text-sm">
                        <thead>
                            <tr>
                                <th className="text-left p-3 bg-gray-50 border-b">Strefa \ Przerwa</th>
                                {breaks.map(b => (
                                    <th key={b.id} className="p-3 bg-gray-50 border-b min-w-[120px] text-center border-l">
                                        <div className="font-bold text-gray-700">{b.name}</div>
                                        <div className="text-[10px] text-gray-400 font-normal">Po lekcji {b.afterLesson}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {zones.map(z => (
                                <tr key={z.id} className="border-b last:border-0 hover:bg-gray-50">
                                    <td className="p-3 font-medium text-gray-900">{z.name}</td>
                                    {breaks.map(b => (
                                        <td key={b.id} className="p-3 text-center border-l">
                                            <input
                                                type="number"
                                                min="0"
                                                max="5"
                                                value={requirements[z.id]?.[b.id] || 0}
                                                onChange={(e) => updateRequirement(z.id, b.id, e.target.value)}
                                                className="w-12 h-8 text-center border border-gray-300 rounded focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none font-bold text-lg"
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex justify-end pt-4">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-blue-700 transition shadow-lg flex items-center gap-2"
                    >
                        {saving ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white" /> : <Save className="h-5 w-5" />}
                        {saving ? 'Zapisywanie...' : 'Zapisz Ustawienia'}
                    </button>
                </div>
            </div>
        </div>
    )
}
