import { db, collection, addDoc, storage, ref, uploadBytes, getDownloadURL, doc, getDoc, updateDoc } from './firebase-config.js';

const addProductForm = document.getElementById('addProductForm');

// Edit Mode detection
const urlParams = new URLSearchParams(window.location.search);
const productId = urlParams.get('id');
const isEditMode = !!productId;

// Variety Elements
const colorsInput = document.getElementById('colors');
const varietyStockSection = document.getElementById('varietyStockSection');
const sameQuantityCheck = document.getElementById('sameQuantityCheck');
const varietyStockTableContainer = document.getElementById('varietyStockTableContainer');
const varietyStockTableBody = document.getElementById('varietyStockTableBody');
const stockInput = document.getElementById('stock');

let existingProductData = null;
let savedVariantQuantities = {}; // key: "size-color", value: quantity

// Helper to show custom toast notifications
function showToast(message, isError = false) {
    const toast = document.getElementById('toastNotification');
    const toastIcon = document.getElementById('toastIcon');
    const toastTitle = document.getElementById('toastTitle');
    const toastMessage = document.getElementById('toastMessage');

    if (!toast) return;

    if (isError) {
        toast.classList.add('error');
        if (toastIcon) toastIcon.textContent = '✕';
        if (toastTitle) toastTitle.textContent = 'Error';
    } else {
        toast.classList.remove('error');
        if (toastIcon) toastIcon.textContent = '✓';
        if (toastTitle) toastTitle.textContent = 'Success';
    }

    if (toastMessage) toastMessage.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

// Get selected sizes and colors
function getVarieties() {
    const sizeCheckboxes = document.querySelectorAll('input[name="sizes"]:checked');
    const sizes = Array.from(sizeCheckboxes).map(cb => cb.value);
    const colorsText = colorsInput ? colorsInput.value.trim() : '';
    const colors = colorsText ? colorsText.split(',').map(c => c.trim()).filter(Boolean) : [];
    
    return { sizes, colors };
}

// Dynamically generate the variety quantity inputs
function updateVarietyUI() {
    const { sizes, colors } = getVarieties();
    
    if (sizes.length > 0 || colors.length > 0) {
        if (varietyStockSection) varietyStockSection.style.display = 'block';
    } else {
        if (varietyStockSection) varietyStockSection.style.display = 'none';
        if (varietyStockTableContainer) varietyStockTableContainer.style.display = 'none';
        if (stockInput) {
            stockInput.disabled = false;
            stockInput.readOnly = false;
        }
        return;
    }
    
    if (sameQuantityCheck && sameQuantityCheck.checked) {
        if (varietyStockTableContainer) varietyStockTableContainer.style.display = 'none';
        if (stockInput) {
            stockInput.disabled = false;
            stockInput.readOnly = false;
        }
    } else {
        if (varietyStockTableContainer) varietyStockTableContainer.style.display = 'block';
        if (stockInput) {
            stockInput.disabled = true;
            stockInput.readOnly = true;
        }
        
        const activeSizes = sizes.length > 0 ? sizes : ['N/A'];
        const activeColors = colors.length > 0 ? colors : ['N/A'];
        
        // Save current values from UI inputs
        document.querySelectorAll('.variety-qty-input').forEach(input => {
            const sz = input.getAttribute('data-size');
            const col = input.getAttribute('data-color');
            savedVariantQuantities[`${sz}-${col}`] = parseInt(input.value) || 0;
        });
        
        if (varietyStockTableBody) {
            varietyStockTableBody.innerHTML = '';
            
            let totalStock = 0;
            
            activeSizes.forEach(size => {
                activeColors.forEach(color => {
                    const key = `${size}-${color}`;
                    // Default quantity comes from savedVariantQuantities, or fallback to main stock value
                    const quantity = savedVariantQuantities[key] !== undefined ? savedVariantQuantities[key] : (parseInt(stockInput.value) || 0);
                    totalStock += quantity;
                    
                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid var(--border-color)';
                    tr.innerHTML = `
                        <td style="padding: 10px 12px; font-size: 0.9rem;">${size}</td>
                        <td style="padding: 10px 12px; font-size: 0.9rem;">${color}</td>
                        <td style="padding: 6px 12px;">
                            <input type="number" class="form-control variety-qty-input" data-size="${size}" data-color="${color}" value="${quantity}" min="0" style="width: 100px; padding: 6px; font-size: 0.85rem;">
                        </td>
                    `;
                    varietyStockTableBody.appendChild(tr);
                });
            });
            
            if (stockInput) stockInput.value = totalStock;
            
            // Re-attach input event listeners to recalculate total stock on edit
            document.querySelectorAll('.variety-qty-input').forEach(input => {
                input.addEventListener('input', () => {
                    let sum = 0;
                    document.querySelectorAll('.variety-qty-input').forEach(inp => {
                        sum += parseInt(inp.value) || 0;
                    });
                    if (stockInput) stockInput.value = sum;
                });
            });
        }
    }
}

// Attach event listeners for dynamic variety calculation
document.addEventListener('DOMContentLoaded', () => {
    // Listen for size checkbox changes
    document.querySelectorAll('input[name="sizes"]').forEach(cb => {
        cb.addEventListener('change', updateVarietyUI);
    });
    
    // Listen for colors changes
    if (colorsInput) {
        colorsInput.addEventListener('input', updateVarietyUI);
    }
    
    // Listen for same quantity checkbox changes
    if (sameQuantityCheck) {
        sameQuantityCheck.addEventListener('change', updateVarietyUI);
    }

    // Load existing product if in Edit Mode
    if (isEditMode) {
        loadProductData();
    }
});

// Load existing product details in edit mode
async function loadProductData() {
    try {
        const docRef = doc(db, "products", productId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            existingProductData = docSnap.data();
            
            // Title and header text changes
            const pageTitle = document.querySelector('title');
            if (pageTitle) pageTitle.textContent = 'Edit Product | Admin';
            const headerTitle = document.querySelector('.admin-header h1');
            if (headerTitle) headerTitle.textContent = 'Edit Product';
            const headerDesc = document.querySelector('.admin-header p');
            if (headerDesc) headerDesc.textContent = 'Update an existing product listing in your store.';
            const submitBtn = document.getElementById('submitBtn');
            if (submitBtn) submitBtn.textContent = 'Update Product';
            
            // Populate basic fields
            document.getElementById('pname').value = existingProductData.name || '';
            document.getElementById('price').value = existingProductData.price || 0;
            if (document.getElementById('discount')) {
                document.getElementById('discount').value = existingProductData.discount !== undefined ? existingProductData.discount : '';
            }
            document.getElementById('stock').value = existingProductData.stock || 0;
            document.getElementById('category').value = existingProductData.category || 'Women • Dresses';
            document.getElementById('desc').value = existingProductData.description || '';
            
            // Check matching sizes
            const sizes = existingProductData.sizes || [];
            document.querySelectorAll('input[name="sizes"]').forEach(cb => {
                cb.checked = sizes.includes(cb.value);
            });
            
            // Fill colors input
            const colors = existingProductData.colors || [];
            if (colorsInput) {
                colorsInput.value = colors.join(', ');
            }
            
            // Setup variants quantities mapping
            const variants = existingProductData.variants || [];
            if (variants.length > 0) {
                let isSameStock = true;
                if (variants.length > 1) {
                    const firstStock = variants[0].stock;
                    isSameStock = variants.every(v => v.stock === firstStock);
                }
                
                if (sameQuantityCheck) sameQuantityCheck.checked = isSameStock;
                
                variants.forEach(v => {
                    const key = `${v.size || 'N/A'}-${v.color || 'N/A'}`;
                    savedVariantQuantities[key] = v.stock;
                });
            } else {
                if (sameQuantityCheck) sameQuantityCheck.checked = true;
            }
            
            // Show image preview
            if (existingProductData.imageUrl) {
                const previewImg = document.getElementById('previewImg');
                const imagePreview = document.getElementById('imagePreview');
                const placeholder = document.querySelector('.upload-placeholder');
                if (previewImg && imagePreview && placeholder) {
                    previewImg.src = existingProductData.imageUrl;
                    placeholder.style.display = 'none';
                    imagePreview.style.display = 'block';
                }
            }
            
            // Refresh variety UI
            updateVarietyUI();
            
        } else {
            showToast('Product not found.', true);
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 2000);
        }
    } catch (error) {
        console.error('Error fetching product data:', error);
        showToast('Failed to load product details: ' + error.message, true);
    }
}

// Form Submission handling
if (addProductForm) {
    addProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = document.getElementById('submitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';

        try {
            const name = document.getElementById('pname').value.trim();
            const price = parseFloat(document.getElementById('price').value);
            const discountInput = document.getElementById('discount');
            const discount = discountInput && discountInput.value ? parseFloat(discountInput.value) : 0;
            
            if (isNaN(discount) || discount < 0 || discount > 100) {
                throw new Error('Discount percentage must be between 0 and 100.');
            }

            const stock = parseInt(document.getElementById('stock').value);
            const category = document.getElementById('category').value;
            const description = document.getElementById('desc').value.trim();

            // Sizes Checkboxes
            const sizeCheckboxes = document.querySelectorAll('input[name="sizes"]:checked');
            const sizes = Array.from(sizeCheckboxes).map(cb => cb.value);

            let imageUrl = '';

            // Upload image to Firebase Storage if a new one is selected
            const fileInput = document.getElementById('productImage');
            if (fileInput && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                submitBtn.textContent = 'Uploading Image...';

                const fileExtension = file.name.split('.').pop();
                const uniqueFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExtension}`;
                const imageRef = ref(storage, `products/${uniqueFileName}`);

                const uploadResult = await uploadBytes(imageRef, file);
                imageUrl = await getDownloadURL(uploadResult.ref);
            }

            submitBtn.textContent = 'Saving Product...';

            const imagePreviewContainer = document.getElementById('imagePreview');
            const imageRemoved = imagePreviewContainer && imagePreviewContainer.style.display === 'none';
            const finalImageUrl = imageUrl || (imageRemoved ? '' : (isEditMode ? (existingProductData.imageUrl || '') : ''));

            // Build variants array, sizeColorStock mapping, and sizeStock mapping
            const { sizes: finalSizes, colors: finalColors } = getVarieties();
            const variants = [];
            const sizeColorStock = {};
            const sizeStock = {};
            let totalComputedStock = 0;

            const activeSizes = finalSizes.length > 0 ? finalSizes : ['N/A'];
            const activeColors = finalColors.length > 0 ? finalColors : ['N/A'];

            if (finalSizes.length > 0 || finalColors.length > 0) {
                if (sameQuantityCheck && sameQuantityCheck.checked) {
                    const uniformStock = stock; // stock is the base value from the input field
                    activeSizes.forEach(size => {
                        activeColors.forEach(color => {
                            variants.push({ size, color, stock: uniformStock });
                            sizeColorStock[`${size}_${color}`] = uniformStock;
                            totalComputedStock += uniformStock;
                        });
                    });
                } else {
                    activeSizes.forEach(size => {
                        activeColors.forEach(color => {
                            const inputEl = document.querySelector(`.variety-qty-input[data-size="${size}"][data-color="${color}"]`);
                            const variantStock = inputEl ? (parseInt(inputEl.value) || 0) : 0;
                            variants.push({ size, color, stock: variantStock });
                            sizeColorStock[`${size}_${color}`] = variantStock;
                            totalComputedStock += variantStock;
                        });
                    });
                }

                // Build sizeStock
                activeSizes.forEach(size => {
                    let sizeSum = 0;
                    activeColors.forEach(color => {
                        sizeSum += sizeColorStock[`${size}_${color}`] || 0;
                    });
                    sizeStock[size] = sizeSum;
                });
            } else {
                totalComputedStock = stock;
            }

            // Save product details to Firestore
            const productData = {
                name,
                price,
                discount: discount,
                stock: totalComputedStock, // Update global stock field with the total sum
                category,
                sizes,
                colors: colorsInput ? colorsInput.value.split(',').map(c => c.trim()).filter(Boolean) : [],
                description,
                imageUrl: finalImageUrl,
                variants,
                sizeColorStock,
                sizeStock,
                updatedAt: new Date()
            };

            if (isEditMode) {
                await updateDoc(doc(db, 'products', productId), productData);
                showToast('Product successfully updated!', false);
            } else {
                productData.createdAt = new Date();
                await addDoc(collection(db, 'products'), productData);
                showToast('Product successfully added!', false);
            }

            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 2000);

        } catch (error) {
            console.error('Error saving product:', error.code, error.message);
            showToast(`Failed to save product: ${error.message || error.code}`, true);
            submitBtn.disabled = false;
            submitBtn.textContent = isEditMode ? 'Update Product' : 'Save Product';
        }
    });
}
