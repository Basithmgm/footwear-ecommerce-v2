async function toggleWishlist(productId, btnElement, options = {}) {
    console.log('toggleWishlist called for product:', productId, 'size:', options.size);
    try {
        const response = await fetch('/wishlist/toggle', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                productId,
                size: options.size // Now passing size
            })
        });

        console.log('Response status:', response.status); // Debug log

        const data = await response.json();
        console.log('Response data:', data); // Debug log

        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }

        if (data.success) {
            // Visual Toggle
            if (btnElement) {
                const icon = btnElement.querySelector('i');
                if (data.added) {
                    btnElement.classList.contains('btn-wishlist-custom') ? 
                        btnElement.classList.add('btn-wishlist-active') : 
                        icon.style.color = 'red';
                    
                    if (!btnElement.classList.contains('btn-wishlist-custom')) {
                        icon.className = 'icon-heart';
                    }

                    icon.classList.add('heart-pulse');
                    setTimeout(() => {
                        icon.classList.remove('heart-pulse');
                    }, 400);
                } else {
                    btnElement.classList.contains('btn-wishlist-custom') ? 
                        btnElement.classList.remove('btn-wishlist-active') : 
                        icon.style.color = '';
                    
                    if (!btnElement.classList.contains('btn-wishlist-custom')) {
                        icon.className = 'icon-heart-o';
                    }
                }
            }

            // Notification
            Swal.fire({
                toast: true,
                position: options.position || 'top-end',
                icon: 'success',
                title: data.message,
                showConfirmButton: false,
                timer: 1500
            });

        } else {
            console.error('Failed to toggle wishlist:', data.message);
            Swal.fire({
                toast: true,
                position: options.position || 'top-end',
                icon: 'error',
                title: data.message || 'Failed to update wishlist',
                showConfirmButton: false,
                timer: 1500
            });
        }

    } catch (error) {
        console.error('Error in toggleWishlist:', error);
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'error',
            title: 'An error occurred',
            showConfirmButton: false,
            timer: 2000
        });
    }
}

// Function for Shop Page (and others with product grid)
async function wishlistWithSizeSelection(btn) {
    const icon = btn.querySelector('i');
    
    // If already in wishlist, we remove it immediately
    if (icon.classList.contains('icon-heart') || btn.classList.contains('btn-wishlist-active')) {
        const productJson = JSON.parse(btn.getAttribute('data-product-json'));
        toggleWishlist(productJson._id, btn, { position: 'center' });
        return;
    }

    // Otherwise, we ask for size
    try {
        const product = JSON.parse(btn.getAttribute('data-product-json'));
        
        // Extract unique active sizes
        let allSizes = [];
        // Handle both cases: variants as an array (Standard) or single object (Unwound)
        const variantsArr = Array.isArray(product.variants) ? product.variants : [product.variants];
        
        variantsArr.forEach(v => {
            if (v && v.sizes) {
                v.sizes.forEach(s => {
                    if (!s.isBlocked && s.status === 'Active' && s.quantity > 0) {
                        if (!allSizes.includes(s.size)) allSizes.push(s.size);
                    }
                });
            }
        });
        allSizes.sort((a,b) => a-b);

        if (allSizes.length === 0) {
            Swal.fire('Out of Stock', 'This product has no available sizes.', 'info');
            return;
        }

        // Create Size Buttons HTML
        let sizeHtml = '<div class="d-flex flex-wrap justify-content-center gap-2 mt-3">';
        allSizes.forEach(size => {
            sizeHtml += `<button type="button" class="btn btn-outline-primary m-1 swal-size-btn" data-size="${size}">${size}</button>`;
        });
        sizeHtml += '</div>';

        Swal.fire({
            title: 'Select Size',
            html: sizeHtml,
            showConfirmButton: false,
            showCloseButton: true,
            didOpen: () => {
                const buttons = Swal.getHtmlContainer().querySelectorAll('.swal-size-btn');
                buttons.forEach(b => {
                    b.addEventListener('click', () => {
                        const selectedSize = b.getAttribute('data-size');
                        Swal.close();
                        toggleWishlist(product._id, btn, { size: selectedSize, position: 'center' });
                    });
                });
            }
        });

    } catch (e) {
        console.error("Error in size selection:", e);
    }
}

async function removeFromWishlist(productId) {
    try {
        const response = await fetch('/wishlist/remove', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ productId })
        });

        const data = await response.json();

        if (data.success) {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: data.message,
                showConfirmButton: false,
                timer: 1500
            }).then(() => {
                location.reload(); // Reload to update list
            });
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

document.addEventListener('DOMContentLoaded', function (e) {
    // Detail page button
    const wishlistBtn = document.getElementById('wishlist-btn-detail');
    if (wishlistBtn) {
        wishlistBtn.addEventListener('click', function (e) {
            e.preventDefault();

            // Enforce Size Selection
            const activeSize = document.querySelector('.size-box.active');
            if (!activeSize) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Please select product size',
                    showConfirmButton: false,
                    timer: 2000
                });
                return;
            }

            const productId = this.getAttribute('data-product-id');
            const sizeValue = activeSize.innerText.trim();
            toggleWishlist(productId, this, { size: sizeValue, position: 'center' });
        });
    }

    // Remove buttons on wishlist page (Event Delegation)
    document.addEventListener('click', function (e) {
        const removeBtn = e.target.closest('.remove-wishlist-btn');
        if (removeBtn) {
            e.preventDefault();
            const productId = removeBtn.getAttribute('data-product-id');
            console.log('Remove button clicked for:', productId);
            removeFromWishlist(productId);
        }
    });
});
