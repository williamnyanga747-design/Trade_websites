import React, { useState } from 'react';
import { User } from '../types';
import { UserCircle, Mail, Key, LogOut } from 'lucide-react';

interface ProfileProps {
  currentUser: User | null;
  translate: (text: string) => string;
  onLogout: () => void;
  saveAllData: (updatedFields: any) => void;
  users: User[];
  logAction: (action: string, details: string) => void;
}

export default function Profile({
  currentUser,
  translate: t,
  onLogout,
  saveAllData,
  users,
  logAction
}: ProfileProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  if (!currentUser) return null;

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentPassword !== currentUser.password) {
      alert(t('Current password incorrect!'));
      return;
    }
    if (newPassword !== confirmPassword) {
      alert(t('Passwords do not match!'));
      return;
    }
    if (newPassword.length < 4) {
      alert(t('Password must be at least 4 characters long'));
      return;
    }

    // Update in database
    const updatedUsers = users.map(u => u.id === currentUser.id ? { ...u, password: newPassword } : u);
    saveAllData({ users: updatedUsers });

    // Update in current user session
    const updatedUser = { ...currentUser, password: newPassword };
    localStorage.setItem('tradecore_user', JSON.stringify(updatedUser));

    logAction('Changed Password', `User ${currentUser.username} updated account password.`);
    alert(t('Password updated successfully!'));

    // Reset fields
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="max-w-xl mx-auto mt-8 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden overflow-y-auto max-h-[85vh] scrollbar-thin">
      <div className="h-32 bg-gradient-to-r from-brand to-brand-hover"></div>
      <div className="px-6 pb-6 relative">
        <div className="w-20 h-20 bg-white rounded-full p-1 -mt-10 mb-4 shadow-lg flex items-center justify-center">
          <div className="w-full h-full bg-gray-100 rounded-full flex items-center justify-center text-2xl font-bold text-brand">
            {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
          </div>
        </div>
        <h2 className="text-xl font-bold text-gray-900">{currentUser.name}</h2>
        <div className="text-sm font-semibold text-brand mb-6">{t(currentUser.role)}</div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
            <UserCircle className="w-5 h-5 text-gray-400" />
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('Username')}</div>
              <div className="text-sm font-bold text-gray-900 font-mono">{currentUser.username}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
            <Mail className="w-5 h-5 text-gray-400" />
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('Email Address')}</div>
              <div className="text-sm font-bold text-gray-900">{currentUser.email || t('Not provided')}</div>
            </div>
          </div>
        </div>

        <div className="mt-6 border-t pt-5">
          <h4 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-1">
            <Key className="w-4 h-4 text-brand" />
            {t('Update Profile Password')}
          </h4>
          <form onSubmit={handleUpdatePassword} className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">{t('Current Password')}</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-brand bg-white font-semibold"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">{t('New Password')}</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-brand bg-white font-semibold"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">{t('Confirm Password')}</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-brand bg-white font-semibold"
                />
              </div>
            </div>
            <button
              type="submit"
              className="bg-gray-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-gray-800 transition"
            >
              {t('Save New Password')}
            </button>
          </form>
        </div>

        <div className="mt-6 pt-6 border-t flex justify-end">
          <button
            onClick={onLogout}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition"
          >
            <LogOut className="w-4 h-4" /> {t('Sign Out')}
          </button>
        </div>
      </div>
    </div>
  );
}
