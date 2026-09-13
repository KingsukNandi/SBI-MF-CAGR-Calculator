import "./globals.css";

export const metadata = {
  title: "Mutual Fund Returns Calculator",
  description:
    "Upload a CSV of your Indian mutual fund transactions and see current value, returns and portfolio XIRR. NAV data from AMFI.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white">{children}</body>
    </html>
  );
}
