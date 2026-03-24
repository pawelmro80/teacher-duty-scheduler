
import React, { useState } from 'react';
import axios from 'axios';
import { Lock, User } from 'lucide-react';

interface LoginProps {
    onLoginSuccess: (token: string) => void;
}

export function Login({ onLoginSuccess }: LoginProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isSetup, setIsSetup] = useState(false); // Toggle for Initial Admin Setup
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        try {
            const endpoint = isSetup ? '/api/auth/setup-admin' : '/api/auth/login';
            // Setup expects JSON body, Login also accepts JSON based on our API
            const payload = { username, password };

            const res = await axios.post(`http://127.0.0.1:8765${endpoint}`, payload);

            if (res.data.access_token) {
                onLoginSuccess(res.data.access_token);
            }
        } catch (err: any) {
            console.error(err);
            if (err.response?.status === 401) {
                setError("Nieprawidłowy login lub hasło");
            } else if (err.response?.status === 400 && isSetup) {
                setError("Admin już istnieje. Zaloguj się.");
            } else {
                setError("Błąd logowania. Sprawdź połączenie.");
            }
        }
    };

    return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-100 p-4">
            <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
                <div className="flex justify-center mb-6">
                    <div className="p-4 bg-indigo-100 rounded-full">
                        <Lock className="w-8 h-8 text-indigo-600" />
                    </div>
                </div>

                <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">
                    {isSetup ? "Konfiguracja Administratora" : "Logowanie"}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Nazwa Użytkownika</label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <User className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Hasło</label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Lock className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                type="password"
                                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                        {isSetup ? "Utwórz Admina" : "Zaloguj się"}
                    </button>
                </form>

                <div className="mt-4 text-center">
                    <button
                        type="button"
                        onClick={() => { setIsSetup(!isSetup); setError(null); }}
                        className="text-sm text-indigo-600 hover:text-indigo-500"
                    >
                        {isSetup ? "Masz już konto? Zaloguj się" : "Pierwsze uruchomienie? Skonfiguruj"}
                    </button>
                </div>
            </div>

            <p className="mt-8 text-center text-xs text-gray-400">
                System Planowania Dyżurów v1.2 (Secured)
            </p>
        </div>
    );
}
