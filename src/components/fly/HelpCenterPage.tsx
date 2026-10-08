import { ArrowLeft, Bot, ChevronDown, Mail } from "lucide-react";

const FAQ = [
  {
    q: "কল দিলে কথা শোনা যায় না / Connecting… এ আটকে থাকে",
    a: "দুজনেরই ইন্টারনেট চালু আছে কিনা দেখুন এবং অ্যাপকে মাইক্রোফোন ও ক্যামেরা পারমিশন দিন (Settings → Apps → Fly → Permissions)।",
  },
  {
    q: "ভয়েস মেসেজ রেকর্ড হয় না",
    a: "ফোনের Settings → Apps → Fly → Permissions → Microphone চালু করুন, তারপর আবার চেষ্টা করুন।",
  },
  {
    q: "নোটিফিকেশন আসে না",
    a: "প্রোফাইল মেনু → Notification settings থেকে নোটিফিকেশন চালু করুন এবং ফোনের সেটিংসে Fly-এর নোটিফিকেশন অনুমতি দিন।",
  },
  {
    q: "পাসওয়ার্ড ভুলে গেছি",
    a: "লগইন পেজে 'Forgot password' চাপুন, ইমেইলে রিসেট লিংক যাবে।",
  },
];

export function HelpCenterPage({ onBack, onOpenAI }: { onBack: () => void; onOpenAI: () => void }) {
  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-white">
      <header className="flex items-center gap-3 px-4 h-14 border-b border-gray-100">
        <button onClick={onBack} aria-label="Back" className="text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <p className="font-semibold text-gray-900">Help Center</p>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3">
        <button
          onClick={onOpenAI}
          className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-500 text-white text-left"
        >
          <Bot size={26} />
          <div>
            <p className="font-semibold">Ask Fly AI</p>
            <p className="text-xs opacity-90">যেকোনো প্রশ্নের উত্তর সাথে সাথে</p>
          </div>
        </button>
        {FAQ.map((f) => (
          <details key={f.q} className="group rounded-2xl border border-gray-100 p-4">
            <summary className="flex items-center justify-between gap-2 cursor-pointer list-none text-sm font-medium text-gray-900">
              {f.q}
              <ChevronDown size={16} className="shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-2 text-sm text-gray-600">{f.a}</p>
          </details>
        ))}
        <a
          href="mailto:52sagorislam46@gmail.com"
          className="flex items-center gap-3 p-4 rounded-2xl bg-gray-50 text-sm text-gray-800"
        >
          <Mail size={20} className="text-sky-600" />
          <span>
            Admin <b>Sagor Islam</b>-এর সাথে যোগাযোগ: 52sagorislam46@gmail.com
          </span>
        </a>
      </div>
    </div>
  );
}
