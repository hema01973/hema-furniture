// src/app/page.tsx
export default function Home() {
  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-5xl font-bold text-center text-gray-900 mb-8">
          Welcome to Hema Furniture
        </h1>
        <p className="text-center text-gray-600 text-lg mb-12">
          Your premium furniture store is now live!
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-2">🛋️ Quality Furniture</h2>
            <p className="text-gray-600">Premium quality furniture for your home</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-2">🚚 Fast Delivery</h2>
            <p className="text-gray-600">Quick and reliable shipping</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-2">💳 Secure Payment</h2>
            <p className="text-gray-600">Multiple payment options available</p>
          </div>
        </div>
      </div>
    </main>
  );
}