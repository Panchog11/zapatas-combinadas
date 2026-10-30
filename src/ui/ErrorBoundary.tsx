import { Component, type ReactNode } from 'react';

/** Evita que un error en una pestaña deje la aplicación en blanco */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: unknown }, { err: string | null; key: unknown }> {
  state = { err: null as string | null, key: undefined as unknown };
  static getDerivedStateFromError(e: unknown) { return { err: String(e) }; }
  static getDerivedStateFromProps(p: { resetKey: unknown }, s: { err: string | null; key: unknown }) {
    return p.resetKey !== s.key ? { err: null, key: p.resetKey } : null;
  }
  render() {
    if (this.state.err) return <div className="rounded border-l-4 border-fail bg-red-50 px-3 py-2 text-sm">Error al mostrar esta pestaña: {this.state.err}. Revise los datos ingresados.</div>;
    return this.props.children;
  }
}
