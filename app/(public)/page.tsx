// app/(public)/page.tsx
'use client'
import Link from 'next/link'
import { Building2, Users, TrendingUp, Shield, Clock, BarChart3, CheckCircle2 } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100 sticky top-0 bg-white/80 backdrop-blur-sm z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-teal-600 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-semibold text-gray-900">Z-Rooms</span>
          </div>
          <Link href="/login" className="btn btn-primary">
            Masuk
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 py-20 text-center">
        <div className="inline-block px-4 py-1.5 bg-teal-50 text-teal-700 text-sm font-medium rounded-full mb-6">
          🚀 Sistem Manajemen Properti Modern
        </div>
        <h1 className="text-3xl md:text-5xl font-bold text-gray-900 mb-6 leading-tight">
          Kelola Kos, Kontrakan & Hotel<br/>
          <span className="text-teal-600">Lebih Mudah & Efisien</span>
        </h1>
        <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
          Platform all-in-one untuk manajemen properti sewa. Otomasi pembayaran, laporan real-time, dan kontrol penuh dari satu dashboard.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/login" className="btn btn-primary text-lg px-8 py-3">
            Mulai Gratis 14 Hari
          </Link>
          <a href="#pricing" className="btn bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-lg px-8 py-3">
            Lihat Harga
          </a>
        </div>
        <p className="text-sm text-gray-500 mt-4">
          Tidak perlu kartu kredit • Setup &lt; 5 menit
        </p>
      </section>

      {/* Features */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Semua yang Anda Butuhkan, Satu Platform
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Dirancang khusus untuk pemilik properti sewa di Indonesia
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="card hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-teal-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Manajemen Penyewa</h3>
              <p className="text-gray-600">
                Data penyewa lengkap, riwayat pembayaran, kontrak otomatis, dan reminder jatuh tempo.
              </p>
            </div>

            <div className="card hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-teal-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Pembayaran & Tagihan</h3>
              <p className="text-gray-600">
                Catat pembayaran, buat invoice otomatis, tracking tunggakan, dan laporan keuangan real-time.
              </p>
            </div>

            <div className="card hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
                <BarChart3 className="w-6 h-6 text-teal-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Laporan & Analitik</h3>
              <p className="text-gray-600">
                Dashboard visual, occupancy rate, revenue tracking, dan export data untuk akuntansi.
              </p>
            </div>

            <div className="card hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
                <Building2 className="w-6 h-6 text-teal-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Multi-Properti</h3>
              <p className="text-gray-600">
                Kelola puluhan properti dari satu akun. Per-properti reporting dan team access control.
              </p>
            </div>

            <div className="card hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
                <Clock className="w-6 h-6 text-teal-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Otomasi Pintar</h3>
              <p className="text-gray-600">
                Reminder otomatis via WhatsApp/Email, perpanjangan kontrak, dan notifikasi kamar kosong.
              </p>
            </div>

            <div className="card hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-teal-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Aman & Terpercaya</h3>
              <p className="text-gray-600">
                Data terenkripsi, backup otomatis, dan akses role-based untuk tim Anda.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Harga Transparan, Tanpa Biaya Tersembunyi
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Pilih paket sesuai skala bisnis Anda. Upgrade/downgrade kapan saja.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Starter */}
            <div className="card border-2 border-gray-200 hover:border-teal-500 transition-all">
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Starter</h3>
                <p className="text-gray-600 text-sm">Untuk properti kecil</p>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-bold text-gray-900">Rp 99K</span>
                <span className="text-gray-600">/bulan</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                  <span className="text-gray-700">Hingga 20 kamar</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                  <span className="text-gray-700">1 properti</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                  <span className="text-gray-700">Laporan dasar</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                  <span className="text-gray-700">Email support</span>
                </li>
              </ul>
              <Link href="/login" className="btn bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 w-full justify-center">
                Mulai Trial
              </Link>
            </div>

            {/* Pro (Popular) */}
            <div className="card border-2 border-teal-500 relative hover:shadow-xl transition-all">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-teal-600 text-white text-sm font-medium rounded-full">
                Paling Populer
              </div>
              <div className="mb-6 mt-2">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Pro</h3>
                <p className="text-gray-600 text-sm">Untuk bisnis berkembang</p>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-bold text-gray-900">Rp 299K</span>
                <span className="text-gray-600">/bulan</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                  <span className="text-gray-700">Hingga 100 kamar</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                  <span className="text-gray-700">5 properti</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                  <span className="text-gray-700">Laporan lengkap + export</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                  <span className="text-gray-700">WhatsApp reminder</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                  <span className="text-gray-700">Priority support</span>
                </li>
              </ul>
              <Link href="/login" className="btn btn-primary w-full justify-center">
                Mulai Trial
              </Link>
            </div>

            {/* Enterprise */}
            <div className="card border-2 border-gray-200 hover:border-teal-500 transition-all">
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Enterprise</h3>
                <p className="text-gray-600 text-sm">Untuk skala besar</p>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-bold text-gray-900">Custom</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                  <span className="text-gray-700">Unlimited kamar</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                  <span className="text-gray-700">Unlimited properti</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                  <span className="text-gray-700">Custom integration</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                  <span className="text-gray-700">Dedicated support</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                  <span className="text-gray-700">SLA guarantee</span>
                </li>
              </ul>
              <a href="https://wa.me/6285752700818?text=Halo,%20saya%20tertarik%20dengan%20paket%20Enterprise%20Z-Rooms" 
                 className="btn bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 w-full justify-center"
                 target="_blank" rel="noopener noreferrer">
                Hubungi Kami
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-teal-600 py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Siap Tingkatkan Bisnis Properti Anda?
          </h2>
          <p className="text-teal-100 text-lg mb-8">
            Bergabung dengan ratusan pemilik properti yang sudah mempercayai Z-Rooms
          </p>
          <Link href="/login" className="btn bg-white text-teal-600 hover:bg-gray-50 text-lg px-8 py-3">
            Mulai Gratis Sekarang →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-gray-600 text-sm">
          <p>© 2026 Z-Rooms. Sistem Manajemen Properti Sewa Modern.</p>
          <p className="mt-2">
            <a href="https://wa.me/6285752700818" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">
              Hubungi Kami
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
