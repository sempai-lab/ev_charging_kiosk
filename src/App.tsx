import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import AuthScreen from './components/AuthScreen';
import CostSelectionScreen from './components/CostSelectionScreen';
import ChargingScreen from './components/ChargingScreen';
import SummaryScreen from './components/SummaryScreen';
import AdminPanel from './components/AdminPanel';

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AuthScreen />} />
          <Route path="/select-cost" element={<CostSelectionScreen />} />
          <Route path="/charging" element={<ChargingScreen />} />
          <Route path="/summary" element={<SummaryScreen />} />
          <Route path="/admin" element={<AdminPanel />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
