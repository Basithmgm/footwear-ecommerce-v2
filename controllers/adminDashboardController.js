const Order = require("../models/Order");
const Product = require("../models/Product");
const Category = require("../models/Category");
const User = require("../models/User");
const Analytics = require("../models/Analytics");
const Cart = require("../models/Cart");
const mongoose = require("mongoose");

exports.getDashboard = async (req, res) => {
  try {
    console.log("DEBUG: Rendering Admin Dashboard");
    
    // Check if partials exist (implicitly handled by express)
    res.render("admin/dashboard", {
      pageTitle: "Dashboard",
      path: "/admin/dashboard",
    });
  } catch (error) {
    console.error("CRITICAL: Dashboard Render Error:", error);
    res.status(500).send("Admin Dashboard Error: " + error.message);
  }
};

exports.getDashboardData = async (req, res) => {
  try {
    const { filter = "month" } = req.query;
    const now = new Date();
    let startDate;

    if (filter === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (filter === "week") {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
    } else if (filter === "year") {
      startDate = new Date(now.getFullYear(), 0, 1);
    } else {
      // Default: Month
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const matchQuery = {
      orderedDate: { $gte: startDate },
      orderStatus: { $nin: ["Cancelled", "Payment Pending"] }
    };

    // 1. KPI: Total Revenue & AOV
    const revenueStats = await Order.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalAmount" },
          orderCount: { $sum: 1 },
        },
      },
    ]);

    const stats = revenueStats[0] || { totalRevenue: 0, orderCount: 0 };
    const avgOrderValue = stats.orderCount > 0 ? (stats.totalRevenue / stats.orderCount).toFixed(2) : 0;

    // 2. KPI: Conversion Rate
    const visitors = await Analytics.aggregate([
      { $match: { date: { $gte: startDate } } },
      { $group: { _id: null, total: { $sum: "$uniqueVisitors" } } }
    ]);
    const totalVisitors = (visitors[0]?.total || 0) + 1; // Avoid division by zero
    const conversionRate = ((stats.orderCount / totalVisitors) * 100).toFixed(2);

    // 3. KPI: Abandonment Rate
    // (Total Carts - Total Orders) / Total Carts
    const cartCount = await Cart.countDocuments({ updatedAt: { $gte: startDate } });
    const abandonmentRate = cartCount > 0 ? (((cartCount - stats.orderCount) / cartCount) * 100).toFixed(2) : 0;

    // 4. KPI: Customer Lifetime Value (Simplified: Total Revenue / Total Unique Customers)
    const uniqueCustomers = await Order.distinct("userId", matchQuery);
    const clv = uniqueCustomers.length > 0 ? (stats.totalRevenue / uniqueCustomers.length).toFixed(2) : 0;

    // 5. Sales Trend (Line Chart)
    const salesTrend = await Order.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            $dateToString: { format: filter === "today" ? "%H:00" : "%Y-%m-%d", date: "$orderedDate" }
          },
          revenue: { $sum: "$totalAmount" }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    // 6. Order Status (Donut Chart)
    const orderStatusData = await Order.aggregate([
      { $match: { orderedDate: { $gte: startDate } } },
      { $group: { _id: "$orderStatus", count: { $sum: 1 } } }
    ]);

    // 7. Category Sales (Bar Chart)
    const categorySales = await Order.aggregate([
      { $match: matchQuery },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "productInfo"
        }
      },
      { $unwind: "$productInfo" },
      {
        $lookup: {
          from: "categories",
          localField: "productInfo.category",
          foreignField: "_id",
          as: "categoryInfo"
        }
      },
      { $unwind: "$categoryInfo" },
      {
        $group: {
          _id: "$categoryInfo.name",
          value: { $sum: "$items.itemTotal" }
        }
      }
    ]);

    // 8. Top Products (Table)
    const topProducts = await Order.aggregate([
      { $match: matchQuery },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          name: { $first: "$items.productName" },
          revenue: { $sum: "$items.itemTotal" },
          sold: { $sum: "$items.quantity" },
          image: { $first: "$items.image" }
        }
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 }
    ]);

    // 9. Size Breakdown (Footwear Specific)
    const sizeSales = await Order.aggregate([
      { $match: matchQuery },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.size",
          count: { $sum: "$items.quantity" }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      kpis: {
        totalRevenue: stats.totalRevenue,
        avgOrderValue,
        conversionRate,
        abandonmentRate,
        clv
      },
      charts: {
        salesTrend,
        orderStatus: orderStatusData,
        categorySales,
        sizeSales
      },
      topProducts
    });
  } catch (error) {
    console.error("Dashboard Data API Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
