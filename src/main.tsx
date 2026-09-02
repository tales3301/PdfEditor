import { type FormEvent, type ReactNode, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { LockKeyhole } from 'lucide-react'
import App from './App'
import './styles.css'
import './override.css'
import './form.css'

const ACCESS_KEY = 'plasnorte-acesso-autorizado'
const ACCESS_PASSWORD = '2026Plasnorte2026'

function AccessGate({ children }: { children: ReactNode }) {
  const [authorized, setAuthorized] = useState(() => sessionStorage.getItem(ACCESS_KEY) === 'true')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (password !== ACCESS_PASSWORD) {
      setError('Senha incorreta. Verifique e tente novamente.')
      setPassword('')
      return
    }
    sessionStorage.setItem(ACCESS_KEY, 'true')
    setAuthorized(true)
  }

  if (authorized) return children

  return <main className="login-page">
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-brand"><img src="/plasnorte-logo.jpeg" alt="PlasNorte" /></div>
      <div className="login-icon"><LockKeyhole /></div>
      <span className="login-kicker">ACESSO RESTRITO</span>
      <h1 id="login-title">Editor de pedidos</h1>
      <p>Digite a senha para acessar o sistema PlasNorte.</p>
      <form onSubmit={submit}>
        <label htmlFor="access-password">Senha de acesso</label>
        <input id="access-password" type="password" autoComplete="current-password" autoFocus value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} placeholder="Digite sua senha" aria-invalid={Boolean(error)} />
        {error && <div className="login-error" role="alert">{error}</div>}
        <button type="submit" disabled={!password}><LockKeyhole /> Entrar no sistema</button>
      </form>
      <small>PlasNorte Embalagens · Ambiente seguro</small>
    </section>
  </main>
}

ReactDOM.createRoot(document.getElementById('root')!).render(<AccessGate><App /></AccessGate>)
