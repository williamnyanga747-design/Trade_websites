import React, { useState } from 'react';
import { User } from '../types';
import { UserCircle, Mail, Key, LogOut, BookOpen, Globe, Info, HelpCircle } from 'lucide-react';
import { toast } from '../utils/toast';

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
  const [guideLang, setGuideLang] = useState<'en' | 'sw'>('en');

  const [firstLoginDate] = useState<Date>(() => {
    const key = `tradecore_first_login_${currentUser?.id || 'default'}`;
    const saved = localStorage.getItem(key);
    if (saved) return new Date(saved);
    const now = new Date();
    localStorage.setItem(key, now.toISOString());
    return now;
  });

  if (!currentUser) return null;

  const daysSinceLogin = Math.max(0, Math.floor((new Date().getTime() - firstLoginDate.getTime()) / (1000 * 60 * 60 * 24)));
  const daysRemaining = Math.max(0, 14 - daysSinceLogin);
  const showOrientation = daysRemaining > 0;

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentPassword !== currentUser.password) {
      toast.error(t('Current password incorrect!'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('Passwords do not match!'));
      return;
    }
    if (newPassword.length < 4) {
      toast.error(t('Password must be at least 4 characters long'));
      return;
    }

    // Update in database
    const updatedUsers = users.map(u => u.id === currentUser.id ? { ...u, password: newPassword } : u);
    saveAllData({ users: updatedUsers });

    // Update in current user session
    const updatedUser = { ...currentUser, password: newPassword };
    localStorage.setItem('tradecore_user', JSON.stringify(updatedUser));

    logAction('Changed Password', `User ${currentUser.username} updated account password.`);
    toast.success(t('Password updated successfully!'));

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

        {showOrientation && (
          <div className="mt-8 border-t pt-5">
            <div className="bg-brand/5 border border-brand/15 rounded-xl p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-brand" />
                  <div>
                    <h4 className="font-black text-gray-900 text-sm">{t('System Orientation Guide')}</h4>
                    <p className="text-[10px] text-gray-500 font-medium">
                      {guideLang === 'en' 
                        ? `A comprehensive walkthrough of the TradeCore panels (${daysRemaining} days left)` 
                        : `Mwongozo wa kina wa paneli za TradeCore (Siku ${daysRemaining} zimesalia)`
                      }
                    </p>
                  </div>
                </div>
                <div className="flex bg-gray-200/60 p-0.5 rounded-lg text-[10px] font-black shrink-0">
                  <button 
                    type="button" 
                    onClick={() => setGuideLang('en')} 
                    className={`px-2 py-1 rounded-md transition ${guideLang === 'en' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    English
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setGuideLang('sw')} 
                    className={`px-2 py-1 rounded-md transition ${guideLang === 'sw' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    Kiswahili
                  </button>
                </div>
              </div>

              <div className="space-y-3.5 divide-y divide-gray-100 max-h-[350px] overflow-y-auto pr-1.5 scrollbar-thin">
                <div className="pt-0 space-y-1">
                  <div className="text-xs font-black text-brand uppercase tracking-wide">
                    📊 {guideLang === 'en' ? 'Dashboard & Analytics' : 'Dashibodi na Uchambuzi'}
                  </div>
                  <p className="text-xs text-gray-600 font-medium leading-relaxed">
                    {guideLang === 'en'
                      ? 'Real-time financial reports, cash flows, stock levels, and branch performance metrics at a single glance. Used by administrators to track overall business health.'
                      : 'Ripoti za kifedha za hapo kwa hapo, mtiririko wa pesa, akiba ya bidhaa, na takwimu za utendaji wa matawi. Inatumiwa na wasimamizi kufuatilia afya ya biashara.'
                    }
                  </p>
                </div>

                <div className="pt-3.5 space-y-1">
                  <div className="text-xs font-black text-brand uppercase tracking-wide">
                    📱 {guideLang === 'en' ? 'POS Terminal / Checkout' : 'Terminal ya POS / Kujiandikisha'}
                  </div>
                  <p className="text-xs text-gray-600 font-medium leading-relaxed">
                    {guideLang === 'en'
                      ? 'Active terminal interface for cashier sales. Cashiers log opening floats, select/scan products, handle wholesale/retail price structures, and secure digital checkout sessions.'
                      : 'Kiolesura kikuu cha mauzo. Wauzaji hufungua droo ya fedha, huchagua/kuskani bidhaa, hupanga bei za jumla na rejareja, na kukamilisha mauzo kwa usalama.'
                    }
                  </p>
                </div>

                <div className="pt-3.5 space-y-1">
                  <div className="text-xs font-black text-brand uppercase tracking-wide">
                    🌾 {guideLang === 'en' ? 'Inventory & Stock Category' : 'Udhibiti wa Hisa na Makundi'}
                  </div>
                  <p className="text-xs text-gray-600 font-medium leading-relaxed">
                    {guideLang === 'en'
                      ? 'Product listings where administrators manage base units (e.g., kg) and package units (e.g., sacks), transfer items between stores, set product categories, and manage expiry tracking.'
                      : 'Orodha ya bidhaa ambapo wasimamizi hudhibiti vipimo vya msingi (k.m., kilo) na vipimo vya pakiti (k.m., mifuko), huhamisha bidhaa kati ya stoo, na kufuatilia tarehe za kuharibika.'
                    }
                  </p>
                </div>

                <div className="pt-3.5 space-y-1">
                  <div className="text-xs font-black text-brand uppercase tracking-wide">
                    🧾 {guideLang === 'en' ? 'Receipts Repositories' : 'Kumbukumbu za Risiti'}
                  </div>
                  <p className="text-xs text-gray-600 font-medium leading-relaxed">
                    {guideLang === 'en'
                      ? 'Central repository of compiled transactions. Contains duplicate-print locks, cryptographic security seals to prevent tax leaks, and digital invoice reprint managers.'
                      : 'Kituo kikuu cha kukusanya miamala yote. Ina mifumo ya kuzuia uchapishaji wa risiti wa udanganyifu, mihuri ya usalama ya kidijitali, na usimamizi wa ankara.'
                    }
                  </p>
                </div>

                <div className="pt-3.5 space-y-1">
                  <div className="text-xs font-black text-brand uppercase tracking-wide">
                    💸 {guideLang === 'en' ? 'Expenses Management' : 'Usimamizi wa Gharama'}
                  </div>
                  <p className="text-xs text-gray-600 font-medium leading-relaxed">
                    {guideLang === 'en'
                      ? 'Enables any cashier to register operating expenses (utilities, salaries, rent) on the spot to ensure dynamic real-time net-profit margins on the master dashboards.'
                      : 'Inaruhusu mfanyakazi yeyote kusajili gharama za uendeshaji (maji, umeme, mishahara, kodi) hapo kwa hapo ili kuhakikisha faida halisi inapatikana kwa usahihi.'
                    }
                  </p>
                </div>

                <div className="pt-3.5 space-y-1">
                  <div className="text-xs font-black text-brand uppercase tracking-wide">
                    🤝 {guideLang === 'en' ? 'Suppliers & Customers' : 'Wasambazaji na Wateja'}
                  </div>
                  <p className="text-xs text-gray-600 font-medium leading-relaxed">
                    {guideLang === 'en'
                      ? 'Manage profiles for business partners. Restrict suppliers and customers to target stores only, and manage credits/debits limits.'
                      : 'Dhibiti wasifu wa washirika wa biashara. Panga wasambazaji na wateja maalum kulingana na maduka wanayohudumia na dhibiti mikopo yao.'
                    }
                  </p>
                </div>

                <div className="pt-3.5 space-y-1">
                  <div className="text-xs font-black text-brand uppercase tracking-wide">
                    🛡️ {guideLang === 'en' ? 'Audit Trails & Security Logs' : 'Kumbukumbu za Usalama'}
                  </div>
                  <p className="text-xs text-gray-600 font-medium leading-relaxed">
                    {guideLang === 'en'
                      ? 'Immutable audit ledgers registering every administrative override, terminal selection change, and shift reconciliation. Keeps operations 100% transparent and leak-proof.'
                      : 'Kumbukumbu zisizofutika zinazosajili kila mabadiliko ya kiutawala na usuluhishi wa shift. Huweka shughuli zote wazi kwa asilimia 100 bila uvujaji wa mapato.'
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

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
