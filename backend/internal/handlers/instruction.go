package handlers

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/smtp"
	"net/textproto"
	"path/filepath"
	"strings"
	"time"

	"github.com/alib/crm/config"
	"github.com/alib/crm/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type InstructionHandler struct {
	db  *gorm.DB
	cfg *config.Config
}

func NewInstructionHandler(db *gorm.DB, cfg *config.Config) *InstructionHandler {
	return &InstructionHandler{db: db, cfg: cfg}
}

// ── Transit email config CRUD ──────────────────────────────────────────────────

func (h *InstructionHandler) ListConfigs(c *gin.Context) {
	var configs []models.TransitEmailConfig
	q := h.db.Order("transit_code ASC")
	if c.Query("active") == "true" {
		q = q.Where("active = true")
	}
	if err := q.Find(&configs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, configs)
}

func (h *InstructionHandler) CreateConfig(c *gin.Context) {
	var cfg models.TransitEmailConfig
	if err := c.ShouldBindJSON(&cfg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if cfg.TransitCode == "" || cfg.Emails == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "transit_code and emails are required"})
		return
	}
	cfg.TransitCode = strings.ToUpper(strings.TrimSpace(cfg.TransitCode))
	if err := h.db.Create(&cfg).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, cfg)
}

func (h *InstructionHandler) UpdateConfig(c *gin.Context) {
	var cfg models.TransitEmailConfig
	if err := h.db.First(&cfg, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err := c.ShouldBindJSON(&cfg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cfg.TransitCode = strings.ToUpper(strings.TrimSpace(cfg.TransitCode))
	h.db.Save(&cfg)
	c.JSON(http.StatusOK, cfg)
}

func (h *InstructionHandler) DeleteConfig(c *gin.Context) {
	if err := h.db.Delete(&models.TransitEmailConfig{}, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// ── Send instruction email ────────────────────────────────────────────────────

type SendInstructionRequest struct {
	Subject  string   `json:"subject"`
	Body     string   `json:"body"`
	To       []string `json:"to"`
	// Attachments passed as URLs to download from MinIO
	AttachmentURLs  []string `json:"attachment_urls"`
	AttachmentNames []string `json:"attachment_names"`
}

func (h *InstructionHandler) SendEmail(c *gin.Context) {
	if h.cfg.SMTPHost == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "SMTP не настроен. Укажите SMTP_HOST, SMTP_USER, SMTP_PASSWORD в настройках."})
		return
	}

	var req SendInstructionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.To) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "recipients are required"})
		return
	}

	// Download attachments
	type attachment struct {
		name string
		data []byte
		mime string
	}
	var attachments []attachment
	for i, url := range req.AttachmentURLs {
		if url == "" {
			continue
		}
		resp, err := http.Get(url) //nolint
		if err != nil {
			continue
		}
		data, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		name := fmt.Sprintf("attachment_%d", i+1)
		if i < len(req.AttachmentNames) && req.AttachmentNames[i] != "" {
			name = req.AttachmentNames[i]
		}
		mime := resp.Header.Get("Content-Type")
		if mime == "" {
			mime = mimeByName(name)
		}
		attachments = append(attachments, attachment{name: name, data: data, mime: mime})
	}

	msg := buildEmail(h.cfg.SMTPFrom, req.To, req.Subject, req.Body, attachments)

	addr := h.cfg.SMTPHost + ":" + h.cfg.SMTPPort
	var auth smtp.Auth
	if h.cfg.SMTPUser != "" {
		auth = smtp.PlainAuth("", h.cfg.SMTPUser, h.cfg.SMTPPassword, h.cfg.SMTPHost)
	}

	if err := smtp.SendMail(addr, auth, h.cfg.SMTPFrom, req.To, msg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка отправки: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Email отправлен", "sent_at": time.Now()})
}

// ── Preview / get email config for order ─────────────────────────────────────

func (h *InstructionHandler) GetOrderInstruction(c *gin.Context) {
	var order models.Order
	if err := h.db.
		Preload("Client").
		Preload("AssignedTo").
		Preload("Documents").
		Preload("AWB").
		First(&order, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}

	// Find matching transit email config
	var emailConfigs []models.TransitEmailConfig
	if order.TransitCity != "" {
		h.db.Where("transit_code = ? AND active = true", strings.ToUpper(order.TransitCity)).Find(&emailConfigs)
	}

	var recipients []string
	for _, ec := range emailConfigs {
		for _, e := range strings.Split(ec.Emails, ",") {
			e = strings.TrimSpace(e)
			if e != "" {
				recipients = append(recipients, e)
			}
		}
	}

	// Build subject
	transitCity := order.TransitCity
	destCity := order.DestCity
	if transitCity == "" {
		transitCity = "???"
	}
	if destCity == "" {
		destCity = "???"
	}
	firstAWB := order.FinalAWB
	if firstAWB == "" {
		firstAWB = "INSERT AWB"
	}
	subject := fmt.Sprintf("AWB: %s // %s-%s // %s", firstAWB, transitCity, destCity, order.TrackingNumber)

	// Build body
	body := buildInstructionBody(order, transitCity, destCity)

	// Collect document URLs for attachments
	type DocInfo struct {
		URL      string `json:"url"`
		Name     string `json:"name"`
		Category string `json:"category"`
	}
	var docs []DocInfo
	for _, d := range order.Documents {
		docs = append(docs, DocInfo{URL: d.FileURL, Name: d.FileName, Category: d.Category})
	}
	if order.AWB != nil && order.AWB.FileURL != "" {
		docs = append(docs, DocInfo{URL: order.AWB.FileURL, Name: "1-LEG-AWB.pdf", Category: "awb"})
	}
	if order.AWB2FileURL != "" {
		docs = append(docs, DocInfo{URL: order.AWB2FileURL, Name: "2-LEG-AWB.pdf", Category: "awb2"})
	}

	c.JSON(http.StatusOK, gin.H{
		"order":      order,
		"to":         recipients,
		"subject":    subject,
		"body":       body,
		"documents":  docs,
		"smtp_ready": h.cfg.SMTPHost != "",
	})
}

// ── Helpers ────────────────────────────────────────────────────────────────────

func buildInstructionBody(order models.Order, transitCity, destCity string) string {
	firstAWB := order.FinalAWB
	if firstAWB == "" {
		firstAWB = "INSERT"
	}
	secondAWB := order.XBDAWB
	if secondAWB == "" {
		secondAWB = "INSERT"
	}

	// Determine template by transit city
	switch strings.ToUpper(transitCity) {
	case "MLE":
		return fmt.Sprintf(`Dear team,

Kindly book and ship this service cargo to %s.
Attaching the DXB-%s AWB file.

ATTACH 1-LEG-AWB: %s

INSERT

SU AWB number: %s
Pieces: %d
Weight: %.2f kg
Dimensions: %s
First leg AWB: %s
Shipper 2: %s
Consignee 2: %s`,
			destCity, transitCity,
			firstAWB,
			secondAWB,
			order.Pieces,
			order.WeightKG,
			order.Dimensions,
			firstAWB,
			order.Shipper2,
			order.Consignee2,
		)
	default:
		// Default / CAI template
		return fmt.Sprintf(`Dear Team,

Kindly arrange to ship the below-mentioned shipment from %s-%s. Please find the attached AWB and invoice for your reference.

Below details for the final AWB.
INSERT

1-LEG-AWB: %s
NO of Pcs: %d
DIMENSION: %s
Shipper 2: %s
Consignee 2: %s`,
			transitCity, destCity,
			firstAWB,
			order.Pieces,
			order.Dimensions,
			order.Shipper2,
			order.Consignee2,
		)
	}
}

func mimeByName(name string) string {
	ext := strings.ToLower(filepath.Ext(name))
	switch ext {
	case ".pdf":
		return "application/pdf"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	default:
		return "application/octet-stream"
	}
}

type emailAttachment struct {
	name string
	data []byte
	mime string
}

func buildEmail(from string, to []string, subject, body string, attachments []emailAttachment) []byte {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)

	// Headers
	buf.WriteString("From: " + from + "\r\n")
	buf.WriteString("To: " + strings.Join(to, ", ") + "\r\n")
	buf.WriteString("Subject: " + subject + "\r\n")
	buf.WriteString("MIME-Version: 1.0\r\n")
	buf.WriteString("Content-Type: multipart/mixed; boundary=\"" + w.Boundary() + "\"\r\n\r\n")

	// Text part
	th := make(textproto.MIMEHeader)
	th.Set("Content-Type", "text/plain; charset=utf-8")
	th.Set("Content-Transfer-Encoding", "quoted-printable")
	tw, _ := w.CreatePart(th)
	fmt.Fprint(tw, body)

	// Attachments
	for _, a := range attachments {
		ah := make(textproto.MIMEHeader)
		ah.Set("Content-Type", a.mime+`; name="`+a.name+`"`)
		ah.Set("Content-Transfer-Encoding", "base64")
		ah.Set("Content-Disposition", `attachment; filename="`+a.name+`"`)
		aw, _ := w.CreatePart(ah)
		enc := base64.StdEncoding.EncodeToString(a.data)
		// wrap at 76 chars
		for len(enc) > 76 {
			fmt.Fprint(aw, enc[:76]+"\r\n")
			enc = enc[76:]
		}
		fmt.Fprint(aw, enc)
	}

	w.Close()
	return buf.Bytes()
}
