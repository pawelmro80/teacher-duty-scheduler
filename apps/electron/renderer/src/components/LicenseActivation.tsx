
import React, { useState } from 'react';
import axios from 'axios';
import { Key, Unlock } from 'lucide-react';

interface Props {
    onSuccess: () => void;
}

export function LicenseActivation({ onSuccess }: Props) {
    const [key, setKey] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        try {
            await axios.post('http://127.0.0.1:8765/api/auth/activate', { license_key: key });
            setSuccess(true);
            setTimeout(onSuccess, 1500);
        } catch (err: any) {
            setError(err.response?.data?.detail || "Aktywacja nieudana.");
        }
    };

    return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white p-4">
            <div className="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-md border border-gray-700">
                <div className="flex justify-center mb-6">
                    <div className="p-4 bg-yellow-500/20 rounded-full">
                        <Key className="w-8 h-8 text-yellow-500" />
                    </div>
                </div>

                <h2 className="text-2xl font-bold text-center mb-2">Aktywacja Produktu</h2>
                <p className="text-gray-400 text-center mb-6 text-sm">
                    Wprowadź klucz licencyjny otrzymany od dostawcy (Antigravity).
                </p>

                {success ? (
                    <div className="text-center text-green-400 font-bold mb-4 animate-pulse">
                        Licencja Aktywna! Przeładowywanie...
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <textarea
                            className="w-full h-32 bg-gray-900 border border-gray-600 rounded p-3 text-sm font-mono focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none transition"
                            placeholder="Wklej klucz licencyjny tutaj..."
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            required
                        />

                        {error && (
                            <div className="text-red-400 text-sm text-center bg-red-900/20 p-2 rounded border border-red-900/50">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            className="w-full py-3 bg-yellow-600 hover:bg-yellow-500 text-white font-bold rounded transition flex items-center justify-center gap-2"
                        >
                            <Unlock className="w-4 h-4" />
                            Aktywuj
                        </button>
                    </form>
                )}
            </div>
            <div className="mt-8 text-center text-gray-600 text-xs">
                Hardware ID: {navigator.userAgent.replace(/[^a-zA-Z0-9]/g, '').substring(0, 16)}...
            </div>
        </div>
    );
}
