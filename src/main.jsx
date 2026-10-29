import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';

class AppBoundary extends React.Component{
  state={failed:false};
  static getDerivedStateFromError(){return{failed:true};}
  render(){return this.state.failed?<main className="app-failure" role="alert"><h1>The workspace could not render.</h1><p>Existing browser data has not been cleared. Reload to retry.</p><button className="button primary" onClick={()=>window.location.reload()}>Reload workspace</button></main>:this.props.children;}
}
createRoot(document.getElementById('root')).render(<AppBoundary><App/></AppBoundary>);
