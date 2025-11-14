import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Battery, User, Wallet, RefreshCw, ChevronDown } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { db } from '../services/database';

export default function AuthScreen() {
  const navigate = useNavigate();
  const { currentUser, setCurrentUser, scanRfid, batteryStatus, refreshBatteryStatus } = useApp();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRfidSelector, setShowRfidSelector] = useState(false);
  const [users] = useState(db.getUsers());

  useEffect(() => {
    refreshBatteryStatus();
  }, [refreshBatteryStatus]);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    
    try {
      const user = await scanRfid();
      if (!user) {
        setError('RFID card not recognized. Please try again or contact admin.');
      }
    } catch (err) {
      setError('Failed to scan RFID card. Please try again.');
    } finally {
      setScanning(false);
    }
  };

  const handleProceed = () => {
    if (currentUser) {
      navigate('/select-cost');
    }
  };

  const handleRecharge = () => {
    navigate('/admin');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setError(null);
    setShowRfidSelector(false);
  };

  const handleSelectRfid = (user: typeof users[0]) => {
    setCurrentUser(user);
    setShowRfidSelector(false);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 rounded-full mb-4">
            <CreditCard className="w-10 h-10 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">EV Charging Station</h1>
          <p className="text-gray-600">Scan your RFID card to begin</p>
        </div>

        {!currentUser ? (
          <div className="space-y-6">
            <button
              onClick={handleScan}
              disabled={scanning}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-3 shadow-lg"
            >
              {scanning ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <CreditCard className="w-5 h-5" />
                  Scan RFID Card
                </>
              )}
            </button>

            <div className="relative">
              <button
                onClick={() => setShowRfidSelector(!showRfidSelector)}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 border-2 border-gray-300"
              >
                <CreditCard className="w-5 h-5" />
                Select RFID Card Manually
                <ChevronDown className={`w-4 h-4 transition-transform ${showRfidSelector ? 'rotate-180' : ''}`} />
              </button>

              {showRfidSelector && (
                <div className="absolute z-10 w-full mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                  {users.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => handleSelectRfid(user)}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0"
                    >
                      <div className="font-semibold text-gray-900">{user.name}</div>
                      <div className="text-sm text-gray-600">RFID: {user.rfidCardId}</div>
                      <div className="text-sm text-green-600 font-medium mt-1">Balance: ₹{user.balance.toFixed(2)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <div className="pt-4 border-t">
              <button
                onClick={handleRecharge}
                className="w-full text-blue-600 hover:text-blue-700 font-medium py-2"
              >
                Recharge Balance (Admin)
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-gray-600" />
                <div>
                  <p className="text-sm text-gray-600">User Name</p>
                  <p className="text-lg font-semibold text-gray-900">{currentUser.name}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Wallet className="w-5 h-5 text-gray-600" />
                <div>
                  <p className="text-sm text-gray-600">Current Balance</p>
                  <p className="text-2xl font-bold text-green-600">₹{currentUser.balance.toFixed(2)}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Battery className="w-5 h-5 text-gray-600" />
                <div>
                  <p className="text-sm text-gray-600">Battery Level</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-3">
                      <div
                        className="bg-green-500 h-3 rounded-full transition-all"
                        style={{ width: `${batteryStatus?.percentage || 0}%` }}
                      />
                    </div>
                    <p className="text-lg font-semibold text-gray-900">
                      {batteryStatus?.percentage.toFixed(0) || 0}%
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleProceed}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg"
              >
                Proceed to Payment Selection
              </button>

              <button
                onClick={handleLogout}
                className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 px-6 rounded-xl transition-all duration-200"
              >
                Logout / Scan Another Card
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

