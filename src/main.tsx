import { createRoot } from 'react-dom/client';
import ElectionDashboard from '@/components/election-dashboard';
import initialSnapshot from '@/lib/election/seed.json';
import type { Snapshot } from '@/lib/election/types';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <ElectionDashboard initialSnapshot={initialSnapshot as Snapshot} />,
);
