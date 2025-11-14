import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Settings, History, Plus, Minus, Save } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { db } from '../services/database';
import type { User, Transaction, SystemSettings } from '../types';

export default function AdminPanel() {
  const navigate = useNavigate();
  const { settings, updateSettings } = useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'settings' | 'history'>('users');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [balanceAdjustment, setBalanceAdjustment] = useState('');
  const [newSettings, setNewSettings] = useState<SystemSettings>(settings);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setNewSettings(settings);
  }, [settings]);

  const loadData = () => {
    const allUsers = db.getUsers();
    setUsers(allUsers);
    setTransactions(db.getTransactions().sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ));
  };

  const handleBalanceAdjustment = (userId: string, amount: number, type: 'add' | 'deduct') => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;

    const adjustment = type === 'add' ? amount : -amount;
    const newBalance = user.balance + adjustment;

    if (newBalance < 0) {
      alert('Balance cannot be negative!');
      return;
    }

    db.updateUserBalance(userId, newBalance);
    db.addTransaction({
      id: Date.now().toString(),
      userId: user.id,
      userName: user.name,
      type: type === 'add' ? 'addition' : 'deduction',
      amount: adjustment,
      timestamp: new Date().toISOString(),
      description: `Admin ${type === 'add' ? 'added' : 'deducted'} balance`,
    });

    loadData();
    setBalanceAdjustment('');
    setSelectedUser(null);
  };

  const handleSaveSettings = () => {
    updateSettings(newSettings);
    alert('Settings saved successfully!');
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin Panel</h1>
              <p className="text-gray-600 mt-1">Manage users, balance, and system settings</p>
            </div>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Home
            </button>
          </div>

          <div className="flex gap-4 mb-6 border-b">
            <button
              onClick={() => setActiveTab('users')}
              className={`px-6 py-3 font-semibold transition-colors ${
                activeTab === 'users'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Users className="w-5 h-5 inline mr-2" />
              Users & Balance
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-6 py-3 font-semibold transition-colors ${
                activeTab === 'settings'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Settings className="w-5 h-5 inline mr-2" />
              Settings
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 py-3 font-semibold transition-colors ${
                activeTab === 'history'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <History className="w-5 h-5 inline mr-2" />
              Transaction History
            </button>
          </div>

          {activeTab === 'users' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900 mb-4">User Management</h2>
              <div className="grid gap-4">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="bg-gray-50 rounded-xl p-6 flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 text-lg">{user.name}</div>
                      <button
                        onClick={() => {
                          const newRfid = prompt(`Enter new RFID card ID for ${user.name}:`, user.rfidCardId);
                          if (newRfid && newRfid.trim() !== '') {
                            const updatedUsers = users.map((u) =>
                              u.id === user.id ? { ...u, rfidCardId: newRfid.trim() } : u
                            );
                            db.saveUsers(updatedUsers);
                            loadData();
                          }
                        }}
                        className="text-sm text-blue-600 hover:text-blue-700 hover:underline mt-1 cursor-pointer"
                      >
                        RFID: {user.rfidCardId} (tap to change)
                      </button>
                      <div className="text-2xl font-bold text-green-600 mt-2">
                        ₹{user.balance.toFixed(2)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedUser(user)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
                      >
                        Adjust Balance
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {selectedUser && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-xl p-6 max-w-md w-full">
                    <h3 className="text-xl font-bold text-gray-900 mb-4">
                      Adjust Balance: {selectedUser.name}
                    </h3>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Amount
                      </label>
                      <input
                        type="number"
                        value={balanceAdjustment}
                        onChange={(e) => setBalanceAdjustment(e.target.value)}
                        placeholder="Enter amount"
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          const amount = parseFloat(balanceAdjustment);
                          if (!isNaN(amount) && amount > 0) {
                            handleBalanceAdjustment(selectedUser.id, amount, 'add');
                          }
                        }}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2"
                      >
                        <Plus className="w-5 h-5" />
                        Add
                      </button>
                      <button
                        onClick={() => {
                          const amount = parseFloat(balanceAdjustment);
                          if (!isNaN(amount) && amount > 0) {
                            handleBalanceAdjustment(selectedUser.id, amount, 'deduct');
                          }
                        }}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2"
                      >
                        <Minus className="w-5 h-5" />
                        Deduct
                      </button>
                      <button
                        onClick={() => {
                          setSelectedUser(null);
                          setBalanceAdjustment('');
                        }}
                        className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 px-4 rounded-lg"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">System Settings</h2>
              
              <div className="bg-gray-50 rounded-xl p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Full Charge Cost (₹)
                  </label>
                  <input
                    type="number"
                    value={newSettings.fullChargeCost}
                    onChange={(e) =>
                      setNewSettings({ ...newSettings, fullChargeCost: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                  <p className="text-sm text-gray-600 mt-1">
                    Cost for 100% battery charge (e.g., ₹100)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cost per kWh (₹)
                  </label>
                  <input
                    type="number"
                    value={newSettings.costPerKWh}
                    onChange={(e) =>
                      setNewSettings({ ...newSettings, costPerKWh: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                  <p className="text-sm text-gray-600 mt-1">
                    Energy-to-cost ratio (e.g., ₹10 per kWh)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Default Battery Capacity (Wh)
                  </label>
                  <input
                    type="number"
                    value={newSettings.defaultBatteryCapacity}
                    onChange={(e) =>
                      setNewSettings({
                        ...newSettings,
                        defaultBatteryCapacity: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                  <p className="text-sm text-gray-600 mt-1">
                    Battery capacity in Watt-hours (e.g., 5000 Wh = 5 kWh)
                  </p>
                </div>

                <button
                  onClick={handleSaveSettings}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg"
                >
                  <Save className="w-5 h-5" />
                  Save Settings
                </button>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Transaction History</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="bg-gray-50 rounded-lg p-4 flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">{transaction.userName}</div>
                      <div className="text-sm text-gray-600">{transaction.description}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(transaction.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <div
                      className={`text-lg font-bold ${
                        transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {transaction.amount >= 0 ? '+' : ''}₹{transaction.amount.toFixed(2)}
                    </div>
                  </div>
                ))}
                {transactions.length === 0 && (
                  <div className="text-center text-gray-500 py-8">No transactions yet</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

