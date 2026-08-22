import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary global — capture les erreurs React non gérées
 * et affiche une UI de repli neumorphique.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);

    // Après un déploiement, un mobile peut conserver un ancien index.html
    // alors que ses chunks ont changé. Recharger une seule fois avec un
    // paramètre cache-busting récupère la version cohérente de l’application.
    const isDynamicImportError = /dynamically imported module|importing a module script failed|failed to fetch dynamically imported module/i.test(error.message);
    const reloadKey = 'konolive-dynamic-import-retried';
    if (isDynamicImportError && window.sessionStorage.getItem(reloadKey) !== '1') {
      window.sessionStorage.setItem(reloadKey, '1');
      const url = new URL(window.location.href);
      url.searchParams.set('__konolive_reload', String(Date.now()));
      window.location.replace(url.toString());
    }
  }


  handleReset = () => {
    window.sessionStorage.removeItem('konolive-dynamic-import-retried');
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex items-center justify-center min-h-[40vh] p-6">
          <div className="neu-card max-w-sm w-full space-y-5 text-center">
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle size={28} className="text-red-600 dark:text-red-400" />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Une erreur est survenue</h2>
              <p className="text-sm text-muted-foreground mt-1 text-pretty">
                Un problème inattendu s'est produit. Veuillez réessayer ou contacter le support.
              </p>
              {this.state.error && (
                <p className="text-xs font-mono text-muted-foreground mt-2 neu-pressed rounded-xl px-3 py-2 text-left truncate">
                  {this.state.error.message}
                </p>
              )}
            </div>
            <button
              onClick={this.handleReset}
              className="neu-btn-primary w-full py-2.5 flex items-center justify-center gap-2 text-sm"
            >
              <RefreshCw size={15} />
              Réessayer
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
