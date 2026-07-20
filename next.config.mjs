/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Bet images come from arbitrary broker-configured hosts; serve them as-is.
  images: { unoptimized: true },
  // gRPC libs use dynamic requires + read the .proto from disk at runtime —
  // keep them out of the webpack bundle.
  serverExternalPackages: ["@grpc/grpc-js", "@grpc/proto-loader"],
};

export default nextConfig;
