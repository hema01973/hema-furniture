'use client';
import type { Metadata } from 'next';
import { useState } from 'react';
import toast from 'react-hot-toast';

export default function ContactPage() {
  const [form, setForm]       = useState({ name: '', email: '', subject: '', message: '' });
  const [submitting, setSub]  = useState(false);
  const [sent, setSent]       = useState(false);

  const submit = async () => {
    if (!form.name || !form.email || !form.message) return toast.error('Please fill all required fields');
    setSub(true);
    // Simulate submission — wire to a real endpoint or Resend/Formspree as needed
    await new Promise(r => setTimeout(r, 800));
    setSent(true);
    toast.success('Message sent! We\'ll reply within 24 hours.');
    setSub(false);
  };

  const inp = 'w-full rounded-xl border border-[#D0C4B4] dark:border-[#3A2D20] px-4 py-3 text-sm bg-white dark:bg-[#1A1208] focus:outline-none focus:border-[#B8935A] text-[#1A1208] dark:text-[#F0EBE2]';

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904]">
      <div className="bg-gradient-to-r from-[#190F07] to-[#3A2010] py-16 px-6">
        <div className="max-w-[900px] mx-auto">
          <h1 className="font-serif text-4xl text-[#FAF8F5] mb-3">Contact Us</h1>
          <p className="text-[#C8B898]">We'd love to hear from you.</p>
        </div>
      </div>
      <div className="max-w-[900px] mx-auto px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div>
            <h2 className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2] mb-6">Get in Touch</h2>
            {sent ? (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-6 text-center">
                <div className="text-4xl mb-3">✅</div>
                <p className="font-semibold text-green-700 dark:text-green-300">Message sent successfully!</p>
                <p className="text-sm text-green-600 dark:text-green-400 mt-1">We'll get back to you within 24 hours.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Name *</label>
                    <input className={inp} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Ahmed Mohamed"/>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Email *</label>
                    <input className={inp} type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="ahmed@email.com"/>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Subject</label>
                  <input className={inp} value={form.subject} onChange={e=>setForm(p=>({...p,subject:e.target.value}))} placeholder="Order question, product inquiry…"/>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Message *</label>
                  <textarea className={`${inp} resize-none`} rows={5} value={form.message} onChange={e=>setForm(p=>({...p,message:e.target.value}))} placeholder="How can we help you?"/>
                </div>
                <button onClick={submit} disabled={submitting} className="w-full bg-[#B8935A] hover:bg-[#D4B07A] text-white font-semibold py-3.5 rounded-xl transition-colors disabled:opacity-60">
                  {submitting ? 'Sending…' : 'Send Message'}
                </button>
              </div>
            )}
          </div>
          <div className="space-y-6">
            <h2 className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2]">Contact Info</h2>
            {[
              { icon: '📍', label: 'Address', value: '5th Settlement, New Cairo, Cairo, Egypt' },
              { icon: '📞', label: 'Phone', value: '+20 100 000 0000' },
              { icon: '📧', label: 'Email', value: 'hello@hemafurniture.com' },
              { icon: '🕐', label: 'Hours', value: 'Sat–Thu: 10:00 AM – 10:00 PM' },
            ].map(c => (
              <div key={c.label} className="flex gap-4">
                <span className="text-2xl">{c.icon}</span>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">{c.label}</p>
                  <p className="text-sm text-[#1A1208] dark:text-[#F0EBE2]">{c.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
