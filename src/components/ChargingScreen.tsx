import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Clock, AlertTriangle, StopCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { db } from '../services/database';
import { hardware } from '../services/hardware';

export default function ChargingScreen() {
  const navigate = useNavigate();
  const { currentSession, setCurrentSession, batteryStatus } = useApp();
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showStopConfirm, setShowStopConfirm] = useState(false);

  useEffect(() => {
    if (!currentSession) {
      navigate('/');
      return;
    }

    // Navigate to summary if charging completed
    if (currentSession.status !== 'in_progress') {
      navigate('/summary', { state: { sessionId: currentSession.id } });
      return;
    }

    const startTime = new Date(currentSession.startTime).getTime();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [currentSession, navigate]);

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStop = async () => {
    if (!currentSession) return;

    const endTime = new Date().toISOString();
    db.updateSession(currentSession.id, {
      status: 'stopped',
      endTime,
      endBattery: batteryStatus?.percentage || null,
      energyDelivered: hardware.getEnergyDelivered(),
    });

    db.addTransaction({
      id: Date.now().toString(),
      userId: currentSession.userId,
      userName: currentSession.userName,
      type: 'charge',
      amount: 0,
      timestamp: endTime,
      description: 'Charging stopped by user',
      sessionId: currentSession.id,
    });

    await hardware.stopCharging();
    setCurrentSession(null);
    navigate('/summary', { state: { sessionId: currentSession.id } });
  };

  if (!currentSession) {
    return null;
  }

  const currentBattery = batteryStatus?.percentage || currentSession.startBattery;
  const startBattery = currentSession.startBattery;
  const targetBattery = currentSession.targetBattery;
  const energyKWh = (currentSession.energyDelivered || 0) / 1000;

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-orange-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-yellow-100 rounded-full mb-4 animate-pulse">
            <Zap className="w-10 h-10 text-yellow-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Charging in Progress</h1>
          <p className="text-gray-600">Your vehicle is being charged</p>
        </div>

        <div className="space-y-6 mb-8">
          <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-600">User ID</span>
              <span className="font-semibold text-gray-900">{currentSession.userId}</span>
            </div>

            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-600">Paid Amount</span>
              <span className="text-2xl font-bold text-green-600">₹{currentSession.paidAmount.toFixed(2)}</span>
            </div>

            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-600">Target Battery</span>
              <span className="text-lg font-semibold text-gray-900">{currentSession.targetBattery.toFixed(0)}%</span>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-600">Current Battery</span>
                <span className="text-2xl font-bold text-blue-600">{currentBattery.toFixed(0)}%</span>
              </div>
              {/* Progress bar showing 0-100% with current battery level */}
              <div className="w-full bg-gray-200 rounded-full h-6 relative">
                {/* Filled portion: shows current battery level from 0% to currentBattery% */}
                <div
                  className="bg-gradient-to-r from-blue-500 to-green-500 h-6 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(currentBattery, 100)}%` }}
                />
                
                {/* Visual markers for start and target battery levels */}
                <div className="absolute inset-0 flex items-center pointer-events-none">
                  {/* Start battery marker (blue line) */}
                  <div 
                    className="absolute w-0.5 h-full bg-blue-400 opacity-60 z-10"
                    style={{ left: `${startBattery}%` }}
                    title={`Start: ${startBattery}%`}
                  />
                  {/* Target battery marker (green line) */}
                  <div 
                    className="absolute w-0.5 h-full bg-green-500 opacity-60 z-10"
                    style={{ left: `${targetBattery}%` }}
                    title={`Target: ${targetBattery}%`}
                  />
                </div>
              </div>
              {/* Labels below the bar showing 0%, Start, Target, 100% */}
              <div className="flex justify-between mt-1 text-xs text-gray-500">
                <span>0%</span>
                <span className="text-blue-600 font-medium">Start: {startBattery.toFixed(0)}%</span>
                <span className="text-green-600 font-medium">Target: {targetBattery.toFixed(0)}%</span>
                <span>100%</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="bg-white rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Energy Delivered</div>
                <div className="text-xl font-bold text-gray-900">{energyKWh.toFixed(2)} kWh</div>
              </div>
              <div className="bg-white rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Remaining Balance</div>
                <div className="text-xl font-bold text-green-600">₹{currentSession.remainingBalance.toFixed(2)}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-sm text-gray-600 mb-1">Voltage</div>
              <div className="text-lg font-bold text-gray-900">{batteryStatus?.voltage.toFixed(1) || 0} V</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-sm text-gray-600 mb-1">Current</div>
              <div className="text-lg font-bold text-gray-900">{batteryStatus?.current.toFixed(1) || 0} A</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-sm text-gray-600 mb-1">Power</div>
              <div className="text-lg font-bold text-gray-900">{batteryStatus?.power || 0} W</div>
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-blue-600" />
            <div>
              <div className="text-sm text-gray-600">Elapsed Time</div>
              <div className="text-lg font-semibold text-gray-900">{formatTime(elapsedTime)}</div>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => setShowStopConfirm(true)}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg"
          >
            <StopCircle className="w-5 h-5" />
            Stop Charging
          </button>
        </div>

        {showStopConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-md w-full">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-yellow-600" />
                <h3 className="text-xl font-bold text-gray-900">Stop Charging?</h3>
              </div>
              <p className="text-gray-600 mb-6">
                Are you sure you want to stop charging? The session will be ended and you'll be shown a summary.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowStopConfirm(false)}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 px-4 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStop}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-lg"
                >
                  Stop Charging
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

