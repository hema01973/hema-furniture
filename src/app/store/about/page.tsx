import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Us | Hema Modern Furniture',
  description: 'Hema Modern Furniture — premium furniture crafted for Egyptian homes since 2010.',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904]">
      <div className="bg-gradient-to-r from-[#190F07] to-[#3A2010] py-16 px-6">
        <div className="max-w-[900px] mx-auto">
          <h1 className="font-serif text-4xl text-[#FAF8F5] mb-3">About Hema</h1>
          <p className="text-[#C8B898] text-base max-w-xl">Premium modern furniture, crafted for Egyptian homes.</p>
        </div>
      </div>
      <div className="max-w-[900px] mx-auto px-6 py-14 space-y-10">
        <section>
          <h2 className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2] mb-4">Our Story</h2>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
            Founded in New Cairo, Hema Modern Furniture has been transforming Egyptian living spaces since 2010.
            We believe great design should be accessible — beautiful, durable furniture that fits the way Egyptians
            actually live, work, and gather.
          </p>
        </section>
        <section>
          <h2 className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2] mb-4">Our Values</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: '🛋️', title: 'Quality First', desc: 'Every piece is selected for durability and craftsmanship.' },
              { icon: '🏠', title: 'Egyptian Design', desc: 'Furniture sized and styled for Egyptian homes and families.' },
              { icon: '🌿', title: 'Responsible Sourcing', desc: 'We partner with ethical manufacturers and sustainable suppliers.' },
            ].map(v => (
              <div key={v.title} className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-6">
                <div className="text-3xl mb-3">{v.icon}</div>
                <h3 className="font-semibold text-[#1A1208] dark:text-[#F0EBE2] mb-2">{v.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{v.desc}</p>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2 className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2] mb-4">Where to Find Us</h2>
          <p className="text-gray-600 dark:text-gray-300">
            Showroom: 5th Settlement, New Cairo, Cairo Governorate, Egypt.<br />
            Open Saturday–Thursday, 10:00 AM – 10:00 PM.
          </p>
        </section>
      </div>
    </div>
  );
}
