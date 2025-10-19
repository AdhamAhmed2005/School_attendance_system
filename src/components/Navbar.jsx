import { School } from "lucide-react";

function Navbar() {
  return (
    <header className="bg-white shadow-md border-b-2 border-blue-500">
      <div className="container mx-auto p-4">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-blue-500 p-3 rounded-lg">
              <School className="w-5 h-5 sm:h-8 sm:w-8 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800">نظام الانضباط المدرسي</h1>
              <p className="text-[14px] sm:text-sm text-gray-600">المدرسة الابتدائية السادسة عشر بالخبر</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-700">مديرة المدرسة: عفاف الحويل</p>
            <p className="text-sm text-gray-600">وكيلة المدرسة: نوف الخزيم</p>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
