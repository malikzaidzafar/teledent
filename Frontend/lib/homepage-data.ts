// Shared static data and types for the homepage sections

export const FEATURES = [
  {
    icon: "",
    title: "AI Scan",
    desc: "Instant analysis of your dental health using computer vision. Our AI detects early signs of issues in seconds.",
    color: "#e8f0fd",
  },
  {
    icon: "",
    title: "Secure Reports",
    desc: "HIPAA-compliant medical reports sent directly to your dashboard. Your data is encrypted and private.",
    color: "#dcfce7",
  },
  {
    icon: "",
    title: "Video Consultation",
    desc: "High-definition video calls with top-rated dentists. Get expert advice without leaving your home.",
    color: "#fef3c7",
  },
];

export const STEPS = [
  { step: "01", title: "Sign Up", desc: "Patients and dentists create a secure account." },
  { step: "02", title: "Upload Image", desc: "Patients upload dental scans or photos for analysis." },
  { step: "03", title: "AI Analysis", desc: "Our AI detects potential dental conditions with high accuracy." },
  { step: "04", title: "Dentist Review", desc: "Certified dentists review AI results and provide guidance." },
];

export const STATS = [
  { value: "10,000+", label: "Patients Served" },
  { value: "98.2%",   label: "AI Accuracy Rate" },
  { value: "500+",    label: "Certified Dentists" },
  { value: "<2min",   label: "Avg. Analysis Time" },
];

export const DENTIST_PERKS = [
  "AI pre-screening saves you up to 60% review time",
  "Secure HIPAA-compliant patient data management",
  "HD video consultation with built-in chat",
  "Flexible scheduling on your terms",
];

export const DENTIST_NOTIFICATIONS = [
  { icon: "", label: "New case assigned",       sub: "John D. – Panoramic X-ray",    time: "2 min ago" },
  { icon: "", label: "AI pre-analysis ready",   sub: "Possible cavity detected",       time: "5 min ago" },
  { icon: "", label: "Consultation scheduled",  sub: "Tomorrow at 10:00 AM",           time: "1 hr ago" },
];
