import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import '@fontsource-variable/inter';
import '@fontsource-variable/sora';
import '@fontsource-variable/jetbrains-mono';
import './index.css';
import Layout from './components/Layout';
import { AppStateProvider } from './state';
import Home from './pages/Home';

const Forecast = lazy(() => import('./pages/Forecast'));
const Planner = lazy(() => import('./pages/Planner'));
const ModelLab = lazy(() => import('./pages/ModelLab'));
const Performance = lazy(() => import('./pages/Performance'));
const Science = lazy(() => import('./pages/Science'));
const Project = lazy(() => import('./pages/Project'));
const NotFound = lazy(() => import('./pages/NotFound'));

function PageFallback() {
  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 pt-36">
      <div className="skeleton mb-6 h-10 w-72" />
      <div className="skeleton mb-3 h-5 w-[32rem] max-w-full" />
      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="skeleton h-36" />
        <div className="skeleton h-36" />
        <div className="skeleton h-36" />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppStateProvider>
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="forecast" element={<Forecast />} />
              <Route path="planner" element={<Planner />} />
              <Route path="model" element={<ModelLab />} />
              <Route path="performance" element={<Performance />} />
              <Route path="science" element={<Science />} />
              <Route path="project" element={<Project />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AppStateProvider>
  </StrictMode>,
);
