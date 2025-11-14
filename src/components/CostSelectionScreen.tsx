import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Battery, Calculator, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { db } from '../services/database';
import { hardware } from '../services/hardware';
import type { ChargingSession } from '../types';

export default function CostSelectionScreen() {
  const navigate = useNavigate();
  const { currentUser, setCurrentUser, setCurrentSession, settings, batteryStatus } = useApp();
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [processing, setProcessing] = useState(false);

  const presetAmounts = [20, 40, 60, 80, 100];

  const currentBattery = batteryStatus?.percentage || 0;
  const fullChargeCost = settings.fullChargeCost;

  const calculateTargetBattery = (amount: number): number => {
    const batteryIncrease = (amount / fullChargeCost) * 100;
    return Math.min(currentBattery + batteryIncrease, 100);
  };

  const targetBattery = selectedAmount ? calculateTargetBattery(selectedAmount) : 0;

  const handleAmountSelect = (amount: number) => {
    if (amount > (currentUser?.balance || 0)) {
      alert('Insufficient balance!');
      return;
    }
    setSelectedAmount(amount);
    setCustomAmount('');
  };

  const handleCustomAmount = (value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num > 0) {
      if (num > (currentUser?.balance || 0)) {
        alert('Insufficient balance!');
        return;
      }
      setSelectedAmount(num);
      setCustomAmount(value);
    } else {
      setSelectedAmount(null);
      setCustomAmount(value);
    }
  };

  const handleConfirm = async () => {
    if (!selectedAmount || !currentUser) return;

    setProcessing(true);

    try {
      // Deduct balance
      const newBalance = currentUser.balance - selectedAmount;
      db.updateUserBalance(currentUser.id, newBalance);

      // Create session
      const session: ChargingSession = {
        id: Date.now().toString(),
        userId: currentUser.id,
        userName: currentUser.name,
        paidAmount: selectedAmount,
        targetBattery: calculateTargetBattery(selectedAmount),
        startBattery: currentBattery,
        endBattery: null,
        energyDelivered: 0,
        voltage: batteryStatus?.voltage || 0,
        current: batteryStatus?.current || 0,
        power: batteryStatus?.power || 0,
        startTime: new Date().toISOString(),
        endTime: null,
        status: 'in_progress',
        remainingBalance: newBalance,
      };

      db.createSession(session);
      db.addTransaction({
        id: Date.now().toString(),
        userId: currentUser.id,
        userName: currentUser.name,
        type: 'charge',
        amount: -selectedAmount,
        timestamp: new Date().toISOString(),
        description: `Charging session started - Target: ${targetBattery.toFixed(0)}%`,
        sessionId: session.id,
      });

      // Update user in context
      setCurrentUser({ ...currentUser, balance: newBalance });
      setCurrentSession(session);

      // Start charging
      await hardware.startCharging(targetBattery);

      navigate('/charging');
    } catch (error) {
      console.error('Error starting charging:', error);
      alert('Failed to start charging. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  if (!currentUser) {
    navigate('/');
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-8">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Select Charging Amount</h1>
          <p className="text-gray-600">Choose how much you want to pay for charging</p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          {presetAmounts.map((amount) => (
            <button
              key={amount}
              onClick={() => handleAmountSelect(amount)}
              disabled={amount > (currentUser.balance || 0)}
              className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                selectedAmount === amount
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300'
              } ${amount > (currentUser.balance || 0) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="text-2xl font-bold text-gray-900">₹{amount}</div>
            </button>
          ))}
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Custom Amount
          </label>
          <div className="relative">
            <input
              type="number"
              value={customAmount}
              onChange={(e) => handleCustomAmount(e.target.value)}
              placeholder="Enter custom amount"
              min="1"
              max={currentUser.balance}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
          </div>
        </div>

        {selectedAmount && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 mb-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Current Battery:</span>
              <div className="flex items-center gap-2">
                <Battery className="w-5 h-5 text-gray-600" />
                <span className="text-lg font-semibold">{currentBattery.toFixed(0)}%</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-600">Est. Battery After Charge:</span>
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-green-600" />
                <span className="text-xl font-bold text-green-600">{targetBattery.toFixed(0)}%</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-gray-600">Amount to Pay:</span>
              <span className="text-2xl font-bold text-gray-900">₹{selectedAmount.toFixed(2)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-600">Remaining Balance:</span>
              <span className="text-lg font-semibold text-gray-700">
                ₹{(currentUser.balance - selectedAmount).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={() => navigate('/')}
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-4 px-6 rounded-xl transition-all duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedAmount || processing}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg"
          >
            {processing ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                Confirm Payment
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

