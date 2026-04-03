import AdminActivityLogs from './pages/AdminActivityLogs.jsx';
import Amenities from './pages/Amenities.jsx';
import About from './pages/About.jsx';
import AdminBookings from './pages/AdminBooking.jsx';
import AdminCalendar from './pages/AdminCalendar.jsx';
import Contact from './pages/Contact.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import AdminInquiries from './pages/AdminInquiries.jsx';
import AdminPackages from './pages/AdminPackage.jsx';
import AdminPackageArchive from './pages/AdminPackageArchive.jsx';
import AdminPaymentQRCodes from './pages/AdminPaymentQRCodes.jsx';
import AdminProfileSettings from './pages/AdminProfileSettings.jsx';
import AdminSecuritySettings from './pages/AdminSecuritySettings.jsx';
import AdminSystemSettings from './pages/AdminSystemSettings.jsx';
import AdminUserPermissions from './pages/AdminUserPermissions.jsx';
import BookingForm from './pages/BookingForm.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import VerifyRegistrationOtp from './pages/VerifyRegistrationOtp.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import MyBookings from './pages/MyBooking.jsx';
import Packages from './pages/Packages.jsx';
import ProfileSettings from './pages/ProfileSettings.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminActivityLogs": AdminActivityLogs,
    "Amenities": Amenities,
    "About": About,
    "AdminBookings": AdminBookings,
    "AdminCalendar": AdminCalendar,
    "Contact": Contact,
    "AdminDashboard": AdminDashboard,
    "AdminInquiries": AdminInquiries,
    "AdminPackages": AdminPackages,
    "AdminPackageArchive": AdminPackageArchive,
    "AdminPaymentQRCodes": AdminPaymentQRCodes,
    "AdminProfileSettings": AdminProfileSettings,
    "AdminSecuritySettings": AdminSecuritySettings,
    "AdminSystemSettings": AdminSystemSettings,
    "AdminUserPermissions": AdminUserPermissions,
    "BookingForm": BookingForm,
    "ForgotPassword": ForgotPassword,
    "VerifyRegistrationOtp": VerifyRegistrationOtp,
    "Home": Home,
    "Login": Login,
    "MyBookings": MyBookings,
    "Packages": Packages,
    "ProfileSettings": ProfileSettings,
    "ResetPassword": ResetPassword,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};