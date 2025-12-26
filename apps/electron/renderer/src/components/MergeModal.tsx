
import React from 'react'

interface MergeModalProps {
    isOpen: boolean
    teacherCode: string
    onClose: () => void
    onMerge: () => void
    onRename: () => void
}

export function MergeModal({ isOpen, teacherCode, onClose, onMerge, onRename }: MergeModalProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 transform transition-all">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Conflict Detected</h3>
                <p className="text-gray-600 mb-6">
                    Verified schedule for <span className="font-bold text-blue-600">{teacherCode}</span> already exists.
                </p>

                <div className="space-y-3">
                    <button
                        onClick={onMerge}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
                    >
                        Merge with Existing
                        <span className="text-blue-200 text-xs font-normal">(Combine Morning/Afternoon)</span>
                    </button>

                    <button
                        onClick={onRename}
                        className="w-full py-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-lg transition"
                    >
                        Change Teacher Code
                    </button>

                    <button
                        onClick={onClose}
                        className="w-full py-2 text-gray-400 hover:text-gray-600 text-sm"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    )
}
