import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Mail, Lock, User, Loader2, Sparkles, KeyRound } from 'lucide-react';
import api from '../utils/api';

export default function Register() {
    const [step, setStep] = useState(1);
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [otp, setOtp] = useState('');

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();
    const { setUser } = useAuthStore();

    const handleSendOtp = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await api.post('/auth/send-otp', { email, type: 'registration' });
            setStep(2);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to send OTP');
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const { data } = await api.post('/auth/register', { name, username, email, password, otp });
            setUser(data);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to verify OTP and register');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-bl from-indigo-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
            <div className="max-w-md w-full backdrop-blur-lg bg-white/10 rounded-2xl shadow-2xl overflow-hidden border border-white/20 p-8 space-y-8 animate-in slide-in-from-bottom-8 duration-700">

                <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-bl from-pink-500 to-purple-600 rounded-xl mx-auto flex items-center justify-center transform hover:-rotate-12 transition-transform shadow-lg shadow-pink-500/30">
                        <Sparkles className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="mt-6 text-3xl font-extrabold text-white tracking-tight">
                        {step === 1 ? 'Join SyncSpace' : 'Verify Email'}
                    </h2>
                    <p className="mt-2 text-sm text-gray-300">
                        {step === 1 ? 'Create an account to collaborate in real-time' : `Enter the 6-digit code sent to ${email}`}
                    </p>
                </div>

                {step === 1 ? (
                    <form className="mt-8 space-y-6" onSubmit={handleSendOtp}>
                        {error && (
                            <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg text-sm text-center">
                                {error}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <User className="h-5 w-5 text-gray-400 group-focus-within:text-pink-400 transition-colors" />
                                </div>
                                <input
                                    id="name"
                                    name="name"
                                    type="text"
                                    required
                                    className="appearance-none rounded-xl relative block w-full pl-10 px-3 py-3 border border-white/10 bg-white/5 placeholder-gray-400 text-white focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
                                    placeholder="Full Name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>

                            {/* Username */}
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <span className="text-gray-400 group-focus-within:text-pink-400 font-bold text-sm transition-colors">@</span>
                                </div>
                                <input
                                    id="username"
                                    name="username"
                                    type="text"
                                    required
                                    className="appearance-none rounded-xl relative block w-full pl-8 px-3 py-3 border border-white/10 bg-white/5 placeholder-gray-400 text-white focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
                                    placeholder="username (unique)"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                                />
                            </div>

                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-gray-400 group-focus-within:text-pink-400 transition-colors" />
                                </div>
                                <input
                                    id="email-address"
                                    name="email"
                                    type="email"
                                    required
                                    className="appearance-none rounded-xl relative block w-full pl-10 px-3 py-3 border border-white/10 bg-white/5 placeholder-gray-400 text-white focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
                                    placeholder="Email address"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>

                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-pink-400 transition-colors" />
                                </div>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    required
                                    className="appearance-none rounded-xl relative block w-full pl-10 px-3 py-3 border border-white/10 bg-white/5 placeholder-gray-400 text-white focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
                                    placeholder="Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-xl text-white bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 focus:ring-offset-gray-900 overflow-hidden transition-all shadow-lg hover:shadow-pink-500/30 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                                    {loading ? (
                                        <Loader2 className="h-5 w-5 text-white animate-spin" />
                                    ) : (
                                        <Sparkles className="h-5 w-5 text-pink-300 group-hover:text-white transition-colors" />
                                    )}
                                </span>
                                {loading ? 'Sending OTP...' : 'Continue'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <form className="mt-8 space-y-6 animate-in slide-in-from-right-4" onSubmit={handleRegister}>
                        {error && (
                            <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg text-sm text-center">
                                {error}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <KeyRound className="h-5 w-5 text-gray-400 group-focus-within:text-pink-400 transition-colors" />
                                </div>
                                <input
                                    id="otp"
                                    name="otp"
                                    type="text"
                                    required
                                    className="appearance-none rounded-xl relative block w-full pl-10 px-3 py-3 border border-white/10 bg-white/5 placeholder-gray-400 text-white focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all tracking-[0.5em] text-center text-lg"
                                    placeholder="000000"
                                    maxLength={6}
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex flex-col space-y-3">
                            <button
                                type="submit"
                                disabled={loading || otp.length < 6}
                                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-xl text-white bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 focus:ring-offset-gray-900 overflow-hidden transition-all shadow-lg hover:shadow-pink-500/30 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                                    {loading ? (
                                        <Loader2 className="h-5 w-5 text-white animate-spin" />
                                    ) : (
                                        <Sparkles className="h-5 w-5 text-pink-300 group-hover:text-white transition-colors" />
                                    )}
                                </span>
                                {loading ? 'Verifying...' : 'Create Account'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                className="text-gray-400 hover:text-white text-sm transition-colors"
                            >
                                Back to details
                            </button>
                        </div>
                    </form>
                )}

                <div className="text-center text-sm font-medium text-gray-300">
                    Already have an account?{' '}
                    <Link to="/login" className="text-pink-400 hover:text-pink-300 transition-colors hover:underline">
                        Sign in here
                    </Link>
                </div>
            </div>
        </div>
    );
}
