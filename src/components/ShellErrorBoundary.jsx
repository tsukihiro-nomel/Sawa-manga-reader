import React from 'react';

export default class ShellErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    this.props.onError?.(error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="boot-screen">
          <div className="boot-screen-panel">
            <p>Impossible d'afficher cette interface. Retour en cours...</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
