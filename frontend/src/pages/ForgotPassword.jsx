import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Loader2, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import api from '../utils/api';

export default function ForgotPassword() {
    const [step, setStep] = useState(1); // 1: Email, 2: OTP & New Password
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');

    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();

    const handleSendOtp = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await api.post('/auth/send-otp', { email, type: 'reset' });
            setStep(2);
            setSuccessMsg('OTP sent to your email.');
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to send OTP');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');
        setLoading(true);

        try {
            await api.post('/auth/reset-password', { email, otp, newPassword });
            setSuccessMsg('Password reset successful! Redirecting to login...');
            setTimeout(() => navigate('/login'), 2000);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to reset password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
            <div className="max-w-md w-full backdrop-blur-lg bg-white/10 rounded-2xl shadow-2xl overflow-hidden border border-white/20 p-8 space-y-8 animate-in fade-in zoom-in duration-500">

                <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-xl mx-auto flex items-center justify-center shadow-lg">
                        <ShieldCheck className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="mt-6 text-3xl font-extrabold text-white tracking-tight">
                        Reset Password
                    </h2>
                    <p className="mt-2 text-sm text-gray-300">
                        {step === 1 ? 'Enter your email to receive an OTP' : `Enter the OTP sent to ${email} and your new password`}
                    </p>
                </div>

                {step === 1 ? (
                    <form className="mt-8 space-y-6" onSubmit={handleSendOtp}>
                        {error && (
                            <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg text-sm text-center animate-pulse">
                                {error}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-gray-400 group-focus-within:text-purple-400 transition-colors" />
                                </div>
                                <input
                                    id="email-address"
                                    name="email"
                                    type="email"
                                    required
                                    className="appearance-none rounded-xl relative block w-full pl-10 px-3 py-3 border border-white/10 bg-white/5 placeholder-gray-400 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                                    placeholder="Email address"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-xl text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 focus:ring-offset-gray-900 overflow-hidden transition-all shadow-lg hover:shadow-purple-500/30 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                                    {loading && <Loader2 className="h-5 w-5 text-white animate-spin" />}
                                </span>
                                {loading ? 'Sending OTP...' : 'Send OTP'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <form className="mt-8 space-y-6 animate-in slide-in-from-right-4" onSubmit={handleResetPassword}>
                        {error && (
                            <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg text-sm text-center">
                                {error}
                            </div>
                        )}
                        {successMsg && (
                            <div className="bg-green-500/20 border border-green-500/50 text-green-200 px-4 py-3 rounded-lg text-sm text-center">
                                {successMsg}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <KeyRound className="h-5 w-5 text-gray-400 group-focus-within:text-purple-400 transition-colors" />
                                </div>
                                <input
                                    id="otp"
                                    name="otp"
                                    type="text"
                                    required
                                    className="appearance-none rounded-xl relative block w-full pl-10 px-3 py-3 border border-white/10 bg-white/5 placeholder-gray-400 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all tracking-[0.5em] text-center text-lg"
                                    placeholder="000000"
                                    maxLength={6}
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value)}
                                />
                            </div>

                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-purple-400 transition-colors" />
                                </div>
                                <input
                                    id="new-password"
                                    name="new-password"
                                    type="password"
                                    required
                                    className="appearance-none rounded-xl relative block w-full pl-10 px-3 py-3 border border-white/10 bg-white/5 placeholder-gray-400 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                                    placeholder="New Password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex flex-col space-y-3">
                            <button
                                type="submit"
                                disabled={loading || otp.length < 6}
                                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-xl text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 focus:ring-offset-gray-900 overflow-hidden transition-all shadow-lg hover:shadow-purple-500/30 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                                    {loading && <Loader2 className="h-5 w-5 text-white animate-spin" />}
                                </span>
                                {loading ? 'Resetting...' : 'Reset Password'}
                            </button>
                            <button
                                type="button"
                                onClick={() => { setStep(1); setError(''); }}
                                className="text-gray-400 hover:text-white text-sm transition-colors"
                            >
                                Back to Email
                            </button>
                        </div>
                    </form>
                )}

                <div className="text-center text-sm font-medium text-gray-300">
                    <Link to="/login" className="text-purple-400 hover:text-purple-300 transition-colors hover:underline">
                        Back to Login
                    </Link>
                </div>
            </div>
        </div>
    );
}
