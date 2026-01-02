import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Battery, User, Wallet, RefreshCw, ChevronDown } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { db } from '../services/database';
import { hardware, type RfidEvent } from '../services/hardware';
import type { User as UserType } from '../types';

export default function AuthScreen() {
  const navigate = useNavigate();
  const { currentUser, setCurrentUser, scanRfid, batteryStatus, refreshBatteryStatus } = useApp();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRfidSelector, setShowRfidSelector] = useState(false);
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);
  const [cardScanned, setCardScanned] = useState(false); // Track if card was actually scanned
  
  // Memoize users list to prevent unnecessary re-renders
  const users = useMemo(() => db.getUsers(), []);

  const cleanupRef = useRef<(() => void) | null>(null);
  const backendCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastBackendCheckRef = useRef<number>(0);
  const currentUserRef = useRef(currentUser);
  const BACKEND_CHECK_CACHE_MS = 3000; // Cache backend check for 3 seconds

  // Update ref when currentUser changes
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Memoize RFID event handler to prevent recreation on every render
  // Using ref for currentUser to avoid dependency issues
  const handleRfidEvent = useCallback((event: RfidEvent) => {
    console.log('[AuthScreen] RFID event:', event);

    // IMPORTANT: Only process RFID events when no user is currently logged in
    // This prevents the same card from repeatedly updating the UI
    // Use ref to get latest value without causing re-renders
    if (currentUserRef.current) {
      console.log('[AuthScreen] Ignoring RFID event - user already authenticated');
      return; // Ignore events when user is already logged in
    }

    if (event.type === 'rfid_detected') {
      if (event.success && event.user) {
        // Valid user detected - update UI automatically
        // Ensure all required User fields are present
        const user: UserType = {
          id: event.user.id,
          name: event.user.name,
          rfidCardId: event.user.rfidCardId,
          balance: event.user.balance,
          phoneNumber: event.user.phoneNumber,
          createdAt: event.user.createdAt || new Date().toISOString(), // Default if missing
        };
        setCurrentUser(user);
        setCardScanned(true); // Mark that card was scanned
        setError(null);
        setScanning(false);
        setBackendConnected(true); // Update connection status on successful event
      } else {
        // Invalid card
        setError(event.error || 'RFID card not recognized. Please try again or contact admin.');
        setScanning(false);
        setCardScanned(false);
      }
    } else if (event.type === 'insufficient_balance') {
      setError('Insufficient balance. Please recharge your account.');
      setScanning(false);
      setCardScanned(false);
    }
  }, [setCurrentUser]); // Removed currentUser from deps, using ref instead

  // Optimized backend check with caching
  const checkBackend = useCallback(async () => {
    const now = Date.now();
    // Use cached result if checked recently
    if (now - lastBackendCheckRef.current < BACKEND_CHECK_CACHE_MS) {
      return;
    }
    lastBackendCheckRef.current = now;

    try {
      const response = await fetch('http://localhost:5000/api/health', {
        cache: 'no-store', // Prevent browser cache
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      setBackendConnected(response.ok);
    } catch {
      setBackendConnected(false);
    }
  }, []);

  useEffect(() => {
    refreshBatteryStatus();

    // Initial backend check
    checkBackend();
    
    // Check backend connection status with caching (every 5 seconds, but cached for 3 seconds)
    backendCheckIntervalRef.current = setInterval(checkBackend, 5000);

    // Start listening for real-time RFID events with memoized handler
    const cleanup = hardware.startRfidEventStream(handleRfidEvent);
    cleanupRef.current = cleanup;

    // Cleanup on unmount
    return () => {
      if (backendCheckIntervalRef.current) {
        clearInterval(backendCheckIntervalRef.current);
      }
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, [refreshBatteryStatus, handleRfidEvent, checkBackend]); // Removed currentUser from deps, using ref in callback

  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setCardScanned(false);
    
    try {
      const user = await scanRfid();
      if (user) {
        setCardScanned(true); // Mark that card was scanned
      } else {
        setError('RFID card not recognized. Please try again or contact admin.');
        setCardScanned(false);
      }
    } catch (err) {
      setError('Failed to scan RFID card. Please try again.');
      setCardScanned(false);
    } finally {
      setScanning(false);
    }
  }, [scanRfid]);

  const handleProceed = useCallback(() => {
    // CRITICAL: Only allow proceeding if:
    // 1. User is authenticated
    // 2. Card was actually scanned (not just manually selected)
    if (!currentUser) {
      setError('Please scan your RFID card first.');
      return;
    }
    
    if (!cardScanned) {
      setError('Please scan your RFID card to proceed. Manual selection is not allowed for security.');
      return;
    }
    
    // All validations passed - proceed to next screen
    navigate('/select-cost');
  }, [currentUser, cardScanned, navigate]);

  const handleRecharge = useCallback(() => {
    navigate('/admin');
  }, [navigate]);

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    setError(null);
    setShowRfidSelector(false);
    setCardScanned(false); // Reset card scan flag
  }, [setCurrentUser]);

  const handleSelectRfid = useCallback((user: typeof users[0]) => {
    // Manual selection is allowed but won't allow proceeding
    // This is for testing/admin purposes only
    setCurrentUser(user);
    setShowRfidSelector(false);
    setError(null);
    setCardScanned(false); // Manual selection doesn't count as scanned
  }, [setCurrentUser, users]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 rounded-full mb-4">
            <CreditCard className="w-10 h-10 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">EV Charging Station</h1>
          <p className="text-gray-600">Scan your RFID card to begin</p>
          {backendConnected === false ? (
            <p className="text-xs text-red-600 mt-1 flex items-center justify-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full"></span>
              Backend not connected - Start backend: python3 backend/rfid_service.py
            </p>
          ) : backendConnected === true ? (
            <p className="text-xs text-green-600 mt-1 flex items-center justify-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Real-time scanning active
            </p>
          ) : (
            <p className="text-xs text-yellow-600 mt-1 flex items-center justify-center gap-1">
              <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
              Checking backend connection...
            </p>
          )}
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
                <div className="flex-1">
                  <p className="text-sm text-gray-600">User Name</p>
                  <p className="text-lg font-semibold text-gray-900">{currentUser.name}</p>
                </div>
              </div>

              {currentUser.phoneNumber && (
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-gray-600" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-600">Contact Number</p>
                    <p className="text-lg font-semibold text-gray-900">{currentUser.phoneNumber}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Wallet className="w-5 h-5 text-gray-600" />
                <div className="flex-1">
                  <p className="text-sm text-gray-600">Current Balance</p>
                  <p className="text-2xl font-bold text-green-600">₹{currentUser.balance.toFixed(2)}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Battery className="w-5 h-5 text-gray-600" />
                <div className="flex-1">
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
              {!cardScanned && (
                <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-lg text-sm">
                  ⚠️ Please scan your RFID card to proceed. Manual selection is not allowed.
                </div>
              )}
              <button
                onClick={handleProceed}
                disabled={!cardScanned}
                className={`w-full text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg ${
                  cardScanned
                    ? 'bg-green-600 hover:bg-green-700 cursor-pointer'
                    : 'bg-gray-400 cursor-not-allowed opacity-60'
                }`}
              >
                {cardScanned ? 'Proceed to Payment Selection' : 'Scan RFID Card to Proceed'}
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

