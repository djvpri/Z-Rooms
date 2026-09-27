const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.railway.app' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
  },
  // Next App Router menyimpan RSC payload klien untuk navigasi client-side.
  // Default dynamic = 0 dtk, tapi navigasi back/forward tetap 5 menit.
  // Dashboard menampilkan data real-time (booking lewat, sesi karaoke) —
  // payload basi membuat kartu "tak check-in" muncul lagi setelah check-in
  // sukses. Paksa 0 di semua segmen supaya selalu fetch baru.
  staleTimes: {
    dynamic: 0,
    static: 0,
  },
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(__dirname)
    return config
  },
}

module.exports = nextConfig
