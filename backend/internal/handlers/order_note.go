package handlers

import (
	"net/http"

	"github.com/alib/crm/internal/auth"
	"github.com/alib/crm/internal/middleware"
	"github.com/alib/crm/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type OrderNoteHandler struct {
	db *gorm.DB
}

func NewOrderNoteHandler(db *gorm.DB) *OrderNoteHandler {
	return &OrderNoteHandler{db: db}
}

func (h *OrderNoteHandler) List(c *gin.Context) {
	var notes []models.OrderNote
	if err := h.db.Preload("User").
		Where("order_id = ?", c.Param("id")).
		Order("created_at DESC").
		Find(&notes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, notes)
}

func (h *OrderNoteHandler) Create(c *gin.Context) {
	var body struct {
		Text string `json:"text" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "text is required"})
		return
	}

	claims, _ := c.Get(middleware.UserKey)
	userID := claims.(*auth.Claims).UserID

	note := models.OrderNote{
		OrderID: 0, // set below
		UserID:  userID,
		Text:    body.Text,
	}

	// parse order id from URL
	var order models.Order
	if err := h.db.First(&order, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}
	note.OrderID = order.ID

	if err := h.db.Create(&note).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.db.Preload("User").First(&note, note.ID)
	c.JSON(http.StatusCreated, note)
}

func (h *OrderNoteHandler) Delete(c *gin.Context) {
	claims, _ := c.Get(middleware.UserKey)
	userID := claims.(*auth.Claims).UserID

	var note models.OrderNote
	if err := h.db.First(&note, c.Param("note_id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "note not found"})
		return
	}

	// Удалять может только автор или суперадмин
	var user models.User
	h.db.First(&user, userID)
	if note.UserID != userID && user.Role != models.RoleSuperAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	h.db.Delete(&note)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
