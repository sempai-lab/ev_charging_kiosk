import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle, Home, Send, Battery, Zap, Clock, Calendar } from 'lucide-react';
import { db } from '../services/database';
import type { ChargingSession } from '../types';

export default function SummaryScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<ChargingSession | null>(null);

  useEffect(() => {
    const sessionId = location.state?.sessionId;
    if (!sessionId) {
      navigate('/');
      return;
    }

    const sessions = db.getSessions();
    const foundSession = sessions.find((s) => s.id === sessionId);
    if (foundSession) {
      setSession(foundSession);
    } else {
      navigate('/');
    }
  }, [location, navigate]);

  if (!session) {
    return null;
  }

  const batteryIncrease = session.endBattery
    ? session.endBattery - session.startBattery
    : 0;
  const energyKWh = session.energyDelivered / 1000;
  const startTime = new Date(session.startTime);
  const endTime = session.endTime ? new Date(session.endTime) : new Date();
  const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const handleSendMessage = async () => {
    if (!session) return;

    // Get user phone number from database
    const users = db.getUsers();
    const user = users.find((u) => u.id === session.userId);
    
    if (!user?.phoneNumber) {
      alert('Phone number not found for this user. Please update user profile in admin panel.');
      return;
    }
    
    // Generate bill message
    const billMessage = `
EV Charging Bill
----------------
User: ${session.userName}
Session ID: ${session.id}

Energy Used: ${energyKWh.toFixed(2)} kWh
Battery Increase: +${batteryIncrease.toFixed(0)}%
Amount: ₹${session.paidAmount.toFixed(2)}
Remaining Balance: ₹${session.remainingBalance.toFixed(2)}

Duration: ${formatTime(duration)}
Start: ${startTime.toLocaleString()}
End: ${endTime.toLocaleString()}

Status: ${session.status === 'completed' ? 'Completed Successfully' : 'Stopped by User'}
    `.trim();

    try {
      // TODO: Integrate with SMS service (Twilio, AWS SNS, etc.)
      // For now, this is a placeholder that shows the message
      console.log('Sending message to:', user.phoneNumber);
      console.log('Message:', billMessage);
      
      // Simulate sending (replace with actual SMS API call)
      // Example integrations:
      // Twilio: await twilioClient.messages.create({ to: user.phoneNumber, body: billMessage, from: '+1234567890' });
      // AWS SNS: await sns.publish({ PhoneNumber: user.phoneNumber, Message: billMessage });
      // Custom API: await fetch('/api/send-sms', { method: 'POST', body: JSON.stringify({ phone: user.phoneNumber, message: billMessage }) });
      
      alert(`Bill message sent to ${user.phoneNumber}\n\n${billMessage}`);
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Charging Completed</h1>
          <p className="text-gray-600">Session Summary</p>
        </div>

        <div className="space-y-6 mb-8">
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 space-y-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Session Summary</h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-5 h-5 text-yellow-600" />
                  <span className="text-sm text-gray-600">Energy Used</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">{energyKWh.toFixed(2)} kWh</div>
              </div>

              <div className="bg-white rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Battery className="w-5 h-5 text-blue-600" />
                  <span className="text-sm text-gray-600">Battery Increase</span>
                </div>
                <div className="text-2xl font-bold text-green-600">+{batteryIncrease.toFixed(0)}%</div>
              </div>

              <div className="bg-white rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-600">Amount Deducted</span>
                </div>
                <div className="text-2xl font-bold text-red-600">₹{session.paidAmount.toFixed(2)}</div>
              </div>

              <div className="bg-white rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-600">Remaining Balance</span>
                </div>
                <div className="text-2xl font-bold text-green-600">₹{session.remainingBalance.toFixed(2)}</div>
              </div>
            </div>

            <div className="pt-4 border-t space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-gray-600" />
                  <span className="text-gray-600">Start Time</span>
                </div>
                <span className="font-semibold text-gray-900">
                  {startTime.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-gray-600" />
                  <span className="text-gray-600">End Time</span>
                </div>
                <span className="font-semibold text-gray-900">
                  {endTime.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-gray-600" />
                  <span className="text-gray-600">Duration</span>
                </div>
                <span className="font-semibold text-gray-900">{formatTime(duration)}</span>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 rounded-xl p-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <div>
                <div className="font-semibold text-gray-900">Status</div>
                <div className="text-green-600">
                  {session.status === 'completed' 
                    ? '✅ Charging Completed Successfully'
                    : '⏸️ Charging Stopped by User'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={handleSendMessage}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg"
          >
            <Send className="w-5 h-5" />
            Genarate Bill
          </button>
          <button
            onClick={() => navigate('/')}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg"
          >
            <Home className="w-5 h-5" />
            Return to Home
          </button>
        </div>
      </div>
    </div>
  );
}

