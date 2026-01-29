import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

function Signup({ onToggleMode }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const { signUp } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        const { data, error } = await signUp({ email, password });

        if (error) {
            setError(error.message);
        } else if (data.session) {
            // Email confirmation is disabled, user is logged in immediately
            // AuthContext will handle the state update
        } else {
            // Email confirmation is enabled
            alert('Check your email for the confirmation link!');
            onToggleMode();
        }
        setLoading(false);
    };

    return (
        <div className="auth-container fade-in">
            <div className="auth-card glass">
                <h2 className="auth-title">Create Account</h2>
                <p className="auth-subtitle">Join the watch party</p>

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label>Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="your@email.com"
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {error && <div className="auth-error">{error}</div>}

                    <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                        {loading ? 'Creating account...' : 'Sign Up'}
                    </button>
                </form>

                <div className="auth-footer">
                    <span>Already have an account?</span>
                    <button onClick={onToggleMode} className="auth-link">Sign In</button>
                </div>
            </div>
        </div>
    );
}

export default Signup;
