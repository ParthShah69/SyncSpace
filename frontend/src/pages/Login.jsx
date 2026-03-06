import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Mail, Lock, Loader2, LogIn } from 'lucide-react';
import api from '../utils/api';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { setUser } = useAuthStore();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const { data } = await api.post('/auth/login', { email, password });
            setUser(data);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to login');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
            <div className="max-w-md w-full backdrop-blur-lg bg-white/10 rounded-2xl shadow-2xl overflow-hidden border border-white/20 p-8 space-y-8 animate-in fade-in zoom-in duration-500">

                <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-xl mx-auto flex items-center justify-center transform hover:rotate-12 transition-transform shadow-lg">
                        <LogIn className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="mt-6 text-3xl font-extrabold text-white tracking-tight">
                        Welcome back
                    </h2>
                    <p className="mt-2 text-sm text-gray-300">
                        Sign in to your SyncSpace account
                    </p>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleLogin}>
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

                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-purple-400 transition-colors" />
                            </div>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                required
                                className="appearance-none rounded-xl relative block w-full pl-10 px-3 py-3 border border-white/10 bg-white/5 placeholder-gray-400 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="text-sm">
                            <Link to="/forgot-password" className="font-medium text-purple-400 hover:text-purple-300">
                                Forgot your password?
                            </Link>
                        </div>
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-xl text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 focus:ring-offset-gray-900 overflow-hidden transition-all shadow-lg hover:shadow-purple-500/30 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                                {loading ? (
                                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                                ) : (
                                    <LogIn className="h-5 w-5 text-purple-300 group-hover:text-white transition-colors" />
                                )}
                            </span>
                            {loading ? 'Signing in...' : 'Sign in'}
                        </button>
                    </div>
                </form>

                <div className="text-center text-sm font-medium text-gray-300">
                    Not a member?{' '}
                    <Link to="/register" className="text-purple-400 hover:text-purple-300 transition-colors hover:underline">
                        Start a 14 day free trial
                    </Link>
                </div>
            </div>
        </div>
    );
}
