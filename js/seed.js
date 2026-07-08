import { db, collection, getDocs, addDoc, doc, setDoc } from './firebase-config.js';

export async function checkAndSeedData() {
  try {
    // 1. Seed Store settings
    const settingsCheck = await getDocs(collection(db, "settings"));
    if (settingsCheck.empty) {
      console.log("Seeding store settings...");
      await setDoc(doc(db, "settings", "store_info"), {
        storeName: "Anjiana Store NY",
        email: "contact@anjiana.com",
        phone: "+1 (555) 987-6543",
        address: "5th Avenue High Street, Manhattan, NY",
        currency: "Rs.",
        taxRate: 12,
        storeUrl: "../index.html",
        adminUrl: "index.html",
        socialLinks: { facebook: "https://facebook.com", instagram: "https://instagram.com", twitter: "https://twitter.com" },
        createdAt: new Date()
      });
    }

    // 2. Seed default categories
    const categoriesCheck = await getDocs(collection(db, "categories"));
    if (categoriesCheck.empty) {
      console.log("Seeding default categories...");
      const sampleCategories = [
        { id: "cat_women", name: "Women", gender: "Women", parent: "" },
        { id: "cat_men", name: "Men", gender: "Men", parent: "" },
        { id: "cat_kids", name: "Kids", gender: "Kids", parent: "" },
        
        // Women Subcategories
        { id: "cat_w_new", name: "New", gender: "Women", parent: "Women" },
        { id: "cat_w_everyday", name: "Everyday", gender: "Women", parent: "Women" },
        { id: "cat_w_nightout", name: "Night Out", gender: "Women", parent: "Women" },
        { id: "cat_w_essentials", name: "Essentials", gender: "Women", parent: "Women" },
        { id: "cat_w_occasion", name: "For the Occasion", gender: "Women", parent: "Women" },

        // Men Subcategories
        { id: "cat_m_new", name: "New", gender: "Men", parent: "Men" },
        { id: "cat_m_everyday", name: "Everyday", gender: "Men", parent: "Men" },
        { id: "cat_m_nightout", name: "Night Out", gender: "Men", parent: "Men" },
        { id: "cat_m_essentials", name: "Essentials", gender: "Men", parent: "Men" },
        { id: "cat_m_occasion", name: "For the Occasion", gender: "Men", parent: "Men" },
        
        // General categories
        { id: "cat_jeans", name: "Jeans", gender: "Unisex", parent: "" },
        { id: "cat_jackets", name: "Jackets", gender: "Unisex", parent: "" },
        { id: "cat_accessories", name: "Accessories", gender: "Unisex", parent: "" },
        { id: "cat_other", name: "Other", gender: "Unisex", parent: "" }
      ];
      for (const cat of sampleCategories) {
        await setDoc(doc(db, "categories", cat.id), {
          name: cat.name,
          gender: cat.gender,
          parent: cat.parent,
          image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=200",
          createdAt: new Date()
        });
      }
    }

    // 3. Seed initial products
    const productsCheck = await getDocs(collection(db, "products"));
    let createdProductIds = [];
    if (productsCheck.empty) {
      console.log("Seeding products...");
      const sampleProducts = [
        {
          name: "Elegant Linen Wrap Dress",
          brand: "Anjiana Linen",
          category: "Women • Everyday",
          price: 110.00,
          discount: 95.00,
          stock: 45,
          description: "Made from organic premium linen, this wrap dress features a flattering waist tie and soft puffed sleeves.",
          imageUrl: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=400",
          images: [
            "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=400",
            "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400"
          ],
          status: "Available",
          sku: "ANJ-DR-LN",
          material: "Linen",
          gender: "Women",
          views: 340,
          variants: [
            { size: "XS", color: "Sage Green", stock: 10, sku: "ANJ-DR-LN-XS-SG" },
            { size: "S", color: "Sage Green", stock: 15, sku: "ANJ-DR-LN-S-SG" },
            { size: "M", color: "Sage Green", stock: 12, sku: "ANJ-DR-LN-M-SG" },
            { size: "L", color: "Sage Green", stock: 8, sku: "ANJ-DR-LN-L-SG" }
          ],
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          name: "Premium Oxford Cotton Shirt",
          brand: "Anjiana Tailored",
          category: "Men • Essentials",
          price: 85.00,
          discount: 0,
          stock: 22,
          description: "A timeless classic tailored shirt constructed from robust Oxford cotton weave. Elegant single needle stitching.",
          imageUrl: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400",
          images: [
            "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400",
            "https://images.unsplash.com/photo-1621072156002-e2fcc103e86e?w=400"
          ],
          status: "Available",
          sku: "ANJ-SH-OX",
          material: "Cotton",
          gender: "Men",
          views: 290,
          variants: [
            { size: "M", color: "Sky Blue", stock: 12, sku: "ANJ-SH-OX-M-BL" },
            { size: "L", color: "Sky Blue", stock: 10, sku: "ANJ-SH-OX-L-BL" }
          ],
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          name: "Slim Fit Stretch Jeans",
          brand: "Anjiana Denim",
          category: "Jeans",
          price: 90.00,
          discount: 75.00,
          stock: 4,
          description: "Crafted with dynamic flex denim yarns, these slim fit jeans offer standard five-pocket design and indigo wash details.",
          imageUrl: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=400",
          images: ["https://images.unsplash.com/photo-1542272604-787c3835535d?w=400"],
          status: "Available",
          sku: "ANJ-JN-SL",
          material: "Denim & Elastane",
          gender: "Unisex",
          views: 450,
          variants: [
            { size: "M", color: "Dark Indigo", stock: 3, sku: "ANJ-JN-SL-M-IN" },
            { size: "L", color: "Dark Indigo", stock: 1, sku: "ANJ-JN-SL-L-IN" }
          ],
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];
      for (const prod of sampleProducts) {
        const docRef = await addDoc(collection(db, "products"), prod);
        createdProductIds.push({ id: docRef.id, name: prod.name, imageUrl: prod.imageUrl, price: prod.discount || prod.price });
      }
    } else {
      productsCheck.forEach(docSnap => {
        createdProductIds.push({ id: docSnap.id, name: docSnap.data().name, imageUrl: docSnap.data().imageUrl, price: docSnap.data().discount || docSnap.data().price });
      });
    }

    // 4. Seed initial customers
    const customersCheck = await getDocs(collection(db, "customers"));
    if (customersCheck.empty) {
      console.log("Seeding customers...");
      const sampleCustomers = [
        { name: "John Miller", email: "john@miller.com", phone: "+1 (301) 456-9900", loyaltyPoints: 340, status: "Active", addresses: ["102 Park Ave, New York, NY"], wishlist: [], createdAt: new Date() },
        { name: "Emily Watson", email: "emily@watson.com", phone: "+1 (202) 112-8877", loyaltyPoints: 120, status: "Active", addresses: ["54 Cedar St, Boston, MA"], wishlist: [], createdAt: new Date() },
        { name: "James Vance", email: "james@vance.com", phone: "+1 (818) 765-4321", loyaltyPoints: 85, status: "Suspended", addresses: ["89 Sunset Blvd, Los Angeles, CA"], wishlist: [], createdAt: new Date() }
      ];
      for (const cust of sampleCustomers) {
        await addDoc(collection(db, "customers"), cust);
      }
    }

    // 5. Seed initial orders
    const ordersCheck = await getDocs(collection(db, "orders"));
    if (ordersCheck.empty && createdProductIds.length >= 3) {
      console.log("Seeding orders...");
      const sampleOrders = [
        {
          customer: { firstName: "John", lastName: "Miller", email: "john@miller.com", phone: "+1 (301) 456-9900", address: "102 Park Ave", city: "New York", postalCode: "10001" },
          items: [
            { id: createdProductIds[0].id, name: createdProductIds[0].name, price: createdProductIds[0].price, size: "S", color: "Sage Green", quantity: 2, imageUrl: createdProductIds[0].imageUrl }
          ],
          subtotal: 190.00,
          shipping: 10.00,
          totalAmount: 200.00,
          paymentStatus: "Paid",
          paymentMethod: "Card Payments",
          orderStatus: "Delivered",
          courier: "DHL Express",
          trackingNumber: "DHL9823749",
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
        },
        {
          customer: { firstName: "Emily", lastName: "Watson", email: "emily@watson.com", phone: "+1 (202) 112-8877", address: "54 Cedar St", city: "Boston", postalCode: "02108" },
          items: [
            { id: createdProductIds[1].id, name: createdProductIds[1].name, price: createdProductIds[1].price, size: "M", color: "Sky Blue", quantity: 1, imageUrl: createdProductIds[1].imageUrl }
          ],
          subtotal: 85.00,
          shipping: 10.00,
          totalAmount: 95.00,
          paymentStatus: "Paid",
          paymentMethod: "Bank Transfer",
          orderStatus: "Shipped",
          courier: "FedEx",
          trackingNumber: "FDX1238945",
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        },
        {
          customer: { firstName: "Alice", lastName: "Gomez", email: "alice@gomez.com", phone: "+1 (415) 321-9988", address: "90 Post St", city: "San Francisco", postalCode: "94104" },
          items: [
            { id: createdProductIds[2].id, name: createdProductIds[2].name, price: createdProductIds[2].price, size: "M", color: "Dark Indigo", quantity: 1, imageUrl: createdProductIds[2].imageUrl }
          ],
          subtotal: 75.00,
          shipping: 10.00,
          totalAmount: 85.00,
          paymentStatus: "Pending",
          paymentMethod: "Cash on Delivery",
          orderStatus: "Pending",
          courier: "",
          trackingNumber: "",
          createdAt: new Date()
        }
      ];
      for (const ord of sampleOrders) {
        await addDoc(collection(db, "orders"), ord);
      }
    }

    // 6. Seed initial reviews
    const reviewsCheck = await getDocs(collection(db, "reviews"));
    if (reviewsCheck.empty && createdProductIds.length >= 3) {
      console.log("Seeding reviews...");
      const sampleReviews = [
        { productName: createdProductIds[0].name, productId: createdProductIds[0].id, customerName: "John Miller", rating: 5, comment: "Absolutely gorgeous dress! Fabric feels luxurious.", status: "Approved", reply: "Thank you John, we are thrilled you liked it!", createdAt: new Date() },
        { productName: createdProductIds[2].name, productId: createdProductIds[2].id, customerName: "Emily Watson", rating: 2, comment: "Too tight around the hips, though denim stretch quality is nice.", status: "Approved", reply: "", createdAt: new Date() }
      ];
      for (const rev of sampleReviews) {
        await addDoc(collection(db, "reviews"), rev);
      }
    }

    // 7. Seed coupons
    const couponsCheck = await getDocs(collection(db, "coupons"));
    if (couponsCheck.empty) {
      console.log("Seeding coupons...");
      const sampleCoupons = [
        { code: "ANJIANA10", type: "Percentage", value: 10, minAmount: 50, expiry: "2026-12-31", status: "Active" },
        { code: "SEASONAL20", type: "Fixed", value: 20, minAmount: 100, expiry: "2026-08-31", status: "Active" }
      ];
      for (const coup of sampleCoupons) {
        await addDoc(collection(db, "coupons"), coup);
      }
    }

    // 8. Seed Banners
    const bannersCheck = await getDocs(collection(db, "banners"));
    if (bannersCheck.empty) {
      console.log("Seeding banners...");
      const sampleBanners = [
        { title: "Summer Breeze Essentials", imageUrl: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=800", link: "/products.html?category=dresses", type: "Banner", createdAt: new Date() },
        { title: "Smart Casual Outerwear", imageUrl: "https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=800", link: "/products.html?category=jackets", type: "Featured", createdAt: new Date() }
      ];
      for (const ban of sampleBanners) {
        await addDoc(collection(db, "banners"), ban);
      }
    }

    // 9. Seed Staff
    const staffCheck = await getDocs(collection(db, "staff"));
    if (staffCheck.empty) {
      console.log("Seeding staff...");
      const sampleStaff = [
        { name: "Administrator Root", email: "admin@anjiana.com", role: "Admin", status: "Approved", createdAt: new Date() },
        { name: "Sarah Connor", email: "sarah@anjiana.com", role: "Manager", status: "Approved", createdAt: new Date() }
      ];
      for (const st of sampleStaff) {
        await addDoc(collection(db, "staff"), st);
      }
    }

  } catch (err) {
    console.error("Data checking/seeding error:", err);
  }
}
